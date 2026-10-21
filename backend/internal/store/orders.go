package store

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/jackc/pgx/v5"
)

type CreateOrderInput struct {
	Customer string
	Items    []CreateOrderItem
}

type CreateOrderItem struct {
	SKU string
	Qty int64
}

// sortedLines is an internal, resolved order line: product data is joined in
// from the database, never taken from the client.
type sortedLine struct {
	productID int64
	sku       string
	name      string
	price     int64
	qty       int64
}

// CreateOrder validates, prices and reserves stock for the whole order in one
// transaction. The caller's "replayed" result is true when an Idempotency-Key
// already produced this exact order.
func (s *Store) CreateOrder(ctx context.Context, in CreateOrderInput, idemKey string) (Order, bool, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Order{}, false, err
	}
	defer tx.Rollback(ctx)

	requestHash := hashOrderRequest(in)
	var keyRowID int64

	if idemKey != "" {
		err := tx.QueryRow(ctx, `
			INSERT INTO idempotency_keys (key, request_hash)
			VALUES ($1, $2)
			ON CONFLICT (key) DO NOTHING
			RETURNING id`, idemKey, requestHash).Scan(&keyRowID)

		if errors.Is(err, pgx.ErrNoRows) {
			// Key already present: replay the stored order or reject the mismatch.
			var (
				storedHash string
				orderID    *int64
			)
			if err := tx.QueryRow(ctx,
				`SELECT request_hash, order_id FROM idempotency_keys WHERE key = $1`,
				idemKey).Scan(&storedHash, &orderID); err != nil {
				return Order{}, false, err
			}
			if storedHash != requestHash {
				return Order{}, false, ErrIdempotencyReuse
			}
			if orderID == nil {
				return Order{}, false, ErrIdempotencyPending
			}
			_ = tx.Rollback(ctx)
			order, err := s.GetOrder(ctx, *orderID)
			return order, true, err
		}
		if err != nil {
			return Order{}, false, err
		}
	}

	// --- Resolve items against the products table (single round trip) ---
	skus := make([]string, len(in.Items))
	for i, it := range in.Items {
		skus[i] = it.SKU
	}

	rows, err := tx.Query(ctx,
		`SELECT id, sku, name, price, is_active FROM products WHERE sku = ANY($1)`, skus)
	if err != nil {
		return Order{}, false, err
	}
	type productRow struct {
		id       int64
		sku      string
		name     string
		price    int64
		isActive bool
	}
	bySKU := make(map[string]productRow, len(skus))
	for rows.Next() {
		var p productRow
		if err := rows.Scan(&p.id, &p.sku, &p.name, &p.price, &p.isActive); err != nil {
			rows.Close()
			return Order{}, false, err
		}
		bySKU[p.sku] = p
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return Order{}, false, err
	}

	lines := make([]sortedLine, 0, len(in.Items))
	var details []FieldDetail
	for i, it := range in.Items {
		p, ok := bySKU[it.SKU]
		if !ok {
			details = append(details, validationDetail(
				fmt.Sprintf("items[%d].sku", i), it.SKU, fmt.Sprintf("unknown sku %q", it.SKU)))
			continue
		}
		if !p.isActive {
			details = append(details, validationDetail(
				fmt.Sprintf("items[%d].sku", i), it.SKU, fmt.Sprintf("product %q is inactive", it.SKU)))
			continue
		}
		lines = append(lines, sortedLine{
			productID: p.id, sku: p.sku, name: p.name, price: p.price, qty: it.Qty,
		})
	}
	if len(details) > 0 {
		return Order{}, false, &ValidationError{Message: "order contains invalid items", Details: details}
	}

	// Lock/decrement in a deterministic product-id order: two concurrent
	// multi-item orders can then never deadlock on each other.
	sort.Slice(lines, func(i, j int) bool { return lines[i].productID < lines[j].productID })

	// --- Reserve stock: guarded UPDATE, never SELECT-then-UPDATE ---
	for _, l := range lines {
		tag, err := tx.Exec(ctx,
			`UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1`,
			l.qty, l.productID)
		if err != nil {
			return Order{}, false, err
		}
		if tag.RowsAffected() == 0 {
			var available int64
			if err := tx.QueryRow(ctx,
				`SELECT stock FROM products WHERE id = $1`, l.productID).Scan(&available); err != nil {
				return Order{}, false, err
			}
			// Returning an error here rolls the transaction back, so none of
			// the earlier decrements survive.
			return Order{}, false, &InsufficientStockError{
				SKU: l.sku, Available: available, Requested: l.qty,
			}
		}
	}

	// --- Write the order + items + movements ---
	var total int64
	for _, l := range lines {
		total += l.price * l.qty
	}

	order := Order{Items: make([]OrderItem, 0, len(lines))}
	err = tx.QueryRow(ctx, `
		INSERT INTO sales_orders (customer, total)
		VALUES ($1, $2)
		RETURNING id, customer, status, total, created_at, cancelled_at`,
		in.Customer, total).
		Scan(&order.ID, &order.Customer, &order.Status, &order.Total, &order.CreatedAt, &order.CancelledAt)
	if err != nil {
		return Order{}, false, err
	}

	for _, l := range lines {
		var item OrderItem
		err := tx.QueryRow(ctx, `
			INSERT INTO sales_order_items (order_id, sku, qty, unit_price)
			VALUES ($1, $2, $3, $4)
			RETURNING id`,
			order.ID, l.sku, l.qty, l.price).Scan(&item.ID)
		if err != nil {
			return Order{}, false, err
		}
		item.SKU = l.sku
		item.ProductName = l.name
		item.Qty = l.qty
		item.UnitPrice = l.price
		item.Subtotal = l.price * l.qty
		order.Items = append(order.Items, item)

		if _, err := tx.Exec(ctx, `
			INSERT INTO stock_movements (product_id, type, qty, note)
			VALUES ($1, 'out', $2, $3)`,
			l.productID, l.qty, fmt.Sprintf("Sales order #%d", order.ID)); err != nil {
			return Order{}, false, err
		}
	}

	if idemKey != "" {
		if _, err := tx.Exec(ctx,
			`UPDATE idempotency_keys SET order_id = $1 WHERE id = $2`, order.ID, keyRowID); err != nil {
			return Order{}, false, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return Order{}, false, err
	}
	return order, false, nil
}

// CancelOrder restores stock and appends compensating movements. The order row
// is locked first, so two concurrent cancels cannot both restore stock.
func (s *Store) CancelOrder(ctx context.Context, id int64) (Order, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Order{}, err
	}
	defer tx.Rollback(ctx)

	var status string
	err = tx.QueryRow(ctx,
		`SELECT status FROM sales_orders WHERE id = $1 FOR UPDATE`, id).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return Order{}, ErrOrderNotFound
	}
	if err != nil {
		return Order{}, err
	}
	if status == "CANCELLED" {
		return Order{}, ErrAlreadyCancelled
	}

	rows, err := tx.Query(ctx, `
		SELECT soi.sku, soi.qty, p.id
		FROM sales_order_items soi
		JOIN products p ON p.sku = soi.sku
		WHERE soi.order_id = $1
		ORDER BY p.id`, id)
	if err != nil {
		return Order{}, err
	}
	type restoreLine struct {
		sku       string
		qty       int64
		productID int64
	}
	var toRestore []restoreLine
	for rows.Next() {
		var l restoreLine
		if err := rows.Scan(&l.sku, &l.qty, &l.productID); err != nil {
			rows.Close()
			return Order{}, err
		}
		toRestore = append(toRestore, l)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return Order{}, err
	}
	// Deterministic lock order (the query already sorts by product id).
	sort.Slice(toRestore, func(i, j int) bool { return toRestore[i].productID < toRestore[j].productID })

	for _, l := range toRestore {
		if _, err := tx.Exec(ctx,
			`UPDATE products SET stock = stock + $1 WHERE id = $2`, l.qty, l.productID); err != nil {
			return Order{}, err
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO stock_movements (product_id, type, qty, note)
			VALUES ($1, 'in', $2, $3)`,
			l.productID, l.qty, fmt.Sprintf("Cancelled order #%d", id)); err != nil {
			return Order{}, err
		}
	}

	if _, err := tx.Exec(ctx, `
		UPDATE sales_orders
		SET status = 'CANCELLED', cancelled_at = now()
		WHERE id = $1`, id); err != nil {
		return Order{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return Order{}, err
	}
	return s.GetOrder(ctx, id)
}

func (s *Store) GetOrder(ctx context.Context, id int64) (Order, error) {
	var o Order
	err := s.pool.QueryRow(ctx, `
		SELECT id, customer, status, total, created_at, cancelled_at
		FROM sales_orders WHERE id = $1`, id).
		Scan(&o.ID, &o.Customer, &o.Status, &o.Total, &o.CreatedAt, &o.CancelledAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Order{}, ErrOrderNotFound
	}
	if err != nil {
		return Order{}, err
	}

	items, err := s.listOrderItems(ctx, []int64{o.ID})
	if err != nil {
		return Order{}, err
	}
	o.Items = items[o.ID]
	if o.Items == nil {
		o.Items = []OrderItem{}
	}
	return o, nil
}

type ListOrdersParams struct {
	Search string
	Status string // all | created | cancelled
	Page   int
	Limit  int
}

// orderWhere is shared by the list query and its count, and mirrors the
// products filter: case-insensitive substring match, already-escaped pattern.
const orderWhere = `
WHERE (COALESCE($1::text, '') = ''
       OR so.customer ILIKE '%' || $1::text || '%' ESCAPE '\')
  AND ($2::text = 'all'
       OR ($2::text = 'created'   AND so.status = 'CREATED')
       OR ($2::text = 'cancelled' AND so.status = 'CANCELLED'))`

func (s *Store) ListOrders(ctx context.Context, params ListOrdersParams) ([]Order, int64, error) {
	if params.Status == "" {
		params.Status = "all"
	}
	pattern := escapeLike(strings.TrimSpace(params.Search))

	var total int64
	if err := s.pool.QueryRow(ctx,
		`SELECT count(*) FROM sales_orders so`+orderWhere, pattern, params.Status).Scan(&total); err != nil {
		return nil, 0, err
	}

	offset := (params.Page - 1) * params.Limit
	rows, err := s.pool.Query(ctx, `
		SELECT so.id, so.customer, so.status, so.total, so.created_at, so.cancelled_at
		FROM sales_orders so`+orderWhere+`
		ORDER BY so.created_at DESC, so.id DESC
		LIMIT $3 OFFSET $4`, pattern, params.Status, params.Limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	orders := make([]Order, 0, params.Limit)
	ids := make([]int64, 0, params.Limit)
	for rows.Next() {
		var o Order
		if err := rows.Scan(&o.ID, &o.Customer, &o.Status, &o.Total, &o.CreatedAt, &o.CancelledAt); err != nil {
			return nil, 0, err
		}
		orders = append(orders, o)
		ids = append(ids, o.ID)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, err
	}

	items, err := s.listOrderItems(ctx, ids)
	if err != nil {
		return nil, 0, err
	}
	for i := range orders {
		orders[i].Items = items[orders[i].ID]
		if orders[i].Items == nil {
			orders[i].Items = []OrderItem{}
		}
	}
	return orders, total, nil
}

// listOrderItems loads items for many orders in one query and groups them.
func (s *Store) listOrderItems(ctx context.Context, orderIDs []int64) (map[int64][]OrderItem, error) {
	result := make(map[int64][]OrderItem, len(orderIDs))
	if len(orderIDs) == 0 {
		return result, nil
	}

	rows, err := s.pool.Query(ctx, `
		SELECT soi.order_id, soi.id, soi.sku, p.name, soi.qty, soi.unit_price
		FROM sales_order_items soi
		JOIN products p ON p.sku = soi.sku
		WHERE soi.order_id = ANY($1)
		ORDER BY soi.order_id, soi.id`, orderIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var (
			orderID int64
			item    OrderItem
		)
		if err := rows.Scan(&orderID, &item.ID, &item.SKU, &item.ProductName, &item.Qty, &item.UnitPrice); err != nil {
			return nil, err
		}
		item.Subtotal = item.Qty * item.UnitPrice
		result[orderID] = append(result[orderID], item)
	}
	return result, rows.Err()
}

// hashOrderRequest fingerprints the client payload so an Idempotency-Key can
// only ever replay an identical request.
func hashOrderRequest(in CreateOrderInput) string {
	parts := make([]string, 0, len(in.Items))
	for _, it := range in.Items {
		parts = append(parts, fmt.Sprintf("%s:%d", it.SKU, it.Qty))
	}
	sort.Strings(parts)
	sum := sha256.Sum256([]byte(strings.Join(parts, ",") + "|" + strings.TrimSpace(in.Customer)))
	return hex.EncodeToString(sum[:])
}
