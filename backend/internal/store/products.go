package store

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// productColumns keeps the row shape identical for every read path,
// including the derived last_movement_at.
const productColumns = `p.id, p.sku, p.name, p.price, p.stock, p.is_active, p.created_at,
	(SELECT max(m.created_at) FROM stock_movements m WHERE m.product_id = p.id)`

// productWhere is shared by the list query and its count query.
// $1 is the already-escaped search pattern, $2 is the status filter.
const productWhere = `
WHERE (COALESCE($1::text, '') = ''
       OR p.sku  ILIKE '%' || $1::text || '%' ESCAPE '\'
       OR p.name ILIKE '%' || $1::text || '%' ESCAPE '\')
  AND ($2::text = 'all'
       OR ($2::text = 'active'   AND p.is_active)
       OR ($2::text = 'inactive' AND NOT p.is_active)
       OR ($2::text = 'low'      AND p.stock <= 10))`

type ListProductsParams struct {
	Search string
	Status string // all | active | inactive | low
	Page   int
	Limit  int
}

type ProductInput struct {
	SKU      string
	Name     string
	Price    int64
	Stock    int64
	IsActive bool
}

type UpdateProductInput struct {
	SKU      string
	Name     string
	Price    int64
	IsActive bool
}

// escapeLike neutralises LIKE wildcards so a search for "100%" is literal.
func escapeLike(s string) string {
	r := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return r.Replace(s)
}

func scanProduct(row pgx.Row) (Product, error) {
	var p Product
	err := row.Scan(&p.ID, &p.SKU, &p.Name, &p.Price, &p.Stock, &p.IsActive, &p.CreatedAt, &p.LastMovementAt)
	return p, err
}

func (s *Store) ListProducts(ctx context.Context, params ListProductsParams) ([]Product, int64, error) {
	if params.Status == "" {
		params.Status = "all"
	}
	pattern := escapeLike(strings.TrimSpace(params.Search))

	var total int64
	if err := s.pool.QueryRow(ctx, `SELECT count(*) FROM products p`+productWhere, pattern, params.Status).Scan(&total); err != nil {
		return nil, 0, err
	}

	offset := (params.Page - 1) * params.Limit
	rows, err := s.pool.Query(ctx,
		`SELECT `+productColumns+` FROM products p`+productWhere+`
		 ORDER BY p.name ASC, p.id ASC
		 LIMIT $3 OFFSET $4`,
		pattern, params.Status, params.Limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	products := make([]Product, 0, params.Limit)
	for rows.Next() {
		p, err := scanProduct(rows)
		if err != nil {
			return nil, 0, err
		}
		products = append(products, p)
	}
	return products, total, rows.Err()
}

func (s *Store) GetProduct(ctx context.Context, id int64) (Product, error) {
	p, err := scanProduct(s.pool.QueryRow(ctx, `SELECT `+productColumns+` FROM products p WHERE p.id = $1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return Product{}, ErrProductNotFound
	}
	return p, err
}

func (s *Store) GetProductBySKU(ctx context.Context, sku string) (Product, error) {
	p, err := scanProduct(s.pool.QueryRow(ctx, `SELECT `+productColumns+` FROM products p WHERE p.sku = $1`, sku))
	if errors.Is(err, pgx.ErrNoRows) {
		return Product{}, ErrProductNotFound
	}
	return p, err
}

// CreateProduct writes the product and, when it starts with stock, the matching
// opening movement — in one transaction, so the ledger always explains the stock.
func (s *Store) CreateProduct(ctx context.Context, in ProductInput) (Product, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Product{}, err
	}
	defer tx.Rollback(ctx)

	var p Product
	err = tx.QueryRow(ctx, `
		INSERT INTO products (sku, name, price, stock, is_active)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, sku, name, price, stock, is_active, created_at, NULL::timestamptz`,
		in.SKU, in.Name, in.Price, in.Stock, in.IsActive).
		Scan(&p.ID, &p.SKU, &p.Name, &p.Price, &p.Stock, &p.IsActive, &p.CreatedAt, &p.LastMovementAt)
	if err != nil {
		if isUniqueViolation(err) {
			return Product{}, &DuplicateSKUError{SKU: in.SKU}
		}
		return Product{}, err
	}

	if in.Stock > 0 {
		note := "Initial stock"
		if _, err := tx.Exec(ctx, `
			INSERT INTO stock_movements (product_id, type, qty, note)
			VALUES ($1, 'in', $2, $3)`, p.ID, in.Stock, note); err != nil {
			return Product{}, err
		}
	}

	return p, tx.Commit(ctx)
}

// UpdateProduct replaces the mutable fields. Stock is deliberately excluded:
// it only changes through the stock endpoint so every change has a movement.
func (s *Store) UpdateProduct(ctx context.Context, id int64, in UpdateProductInput) (Product, error) {
	p, err := scanProduct(s.pool.QueryRow(ctx, `
		WITH updated AS (
			UPDATE products
			SET sku = $1, name = $2, price = $3, is_active = $4
			WHERE id = $5
			RETURNING *
		)
		SELECT u.id, u.sku, u.name, u.price, u.stock, u.is_active, u.created_at,
		       (SELECT max(m.created_at) FROM stock_movements m WHERE m.product_id = u.id)
		FROM updated u`,
		in.SKU, in.Name, in.Price, in.IsActive, id))
	if err != nil {
		if isUniqueViolation(err) {
			return Product{}, &DuplicateSKUError{SKU: in.SKU}
		}
		if errors.Is(err, pgx.ErrNoRows) {
			return Product{}, ErrProductNotFound
		}
	}
	return p, err
}

// DeleteProduct only removes products without history. Movement rows and order
// items are never deleted.
func (s *Store) DeleteProduct(ctx context.Context, id int64) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	var sku string
	err = tx.QueryRow(ctx, `SELECT sku FROM products WHERE id = $1 FOR UPDATE`, id).Scan(&sku)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrProductNotFound
	}
	if err != nil {
		return err
	}

	var hasHistory bool
	err = tx.QueryRow(ctx, `
		SELECT EXISTS (SELECT 1 FROM stock_movements WHERE product_id = $1)
		    OR EXISTS (SELECT 1 FROM sales_order_items WHERE sku = $2)`,
		id, sku).Scan(&hasHistory)
	if err != nil {
		return err
	}
	if hasHistory {
		return &ProductHasHistoryError{SKU: sku}
	}

	if _, err := tx.Exec(ctx, `DELETE FROM products WHERE id = $1`, id); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// AdjustStock applies a single in/out movement and the matching stock delta
// atomically. The decrement is guarded inside the UPDATE, never by a prior
// SELECT, so concurrent adjustments cannot overdraw.
func (s *Store) AdjustStock(ctx context.Context, id int64, movementType string, qty int64, note *string) (Product, StockMovement, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return Product{}, StockMovement{}, err
	}
	defer tx.Rollback(ctx)

	var (
		sku      string
		newStock int64
	)
	if movementType == "out" {
		err = tx.QueryRow(ctx, `
			UPDATE products SET stock = stock - $1
			WHERE id = $2 AND stock >= $1
			RETURNING sku, stock`, qty, id).Scan(&sku, &newStock)
	} else {
		err = tx.QueryRow(ctx, `
			UPDATE products SET stock = stock + $1
			WHERE id = $2
			RETURNING sku, stock`, qty, id).Scan(&sku, &newStock)
	}

	if errors.Is(err, pgx.ErrNoRows) {
		// Either the product is gone or (for "out") the guard failed.
		var (
			foundSKU  string
			available int64
		)
		lookupErr := tx.QueryRow(ctx, `SELECT sku, stock FROM products WHERE id = $1`, id).Scan(&foundSKU, &available)
		if errors.Is(lookupErr, pgx.ErrNoRows) {
			return Product{}, StockMovement{}, ErrProductNotFound
		}
		if lookupErr != nil {
			return Product{}, StockMovement{}, lookupErr
		}
		return Product{}, StockMovement{}, &InsufficientStockError{
			SKU:       foundSKU,
			Available: available,
			Requested: qty,
		}
	}
	if err != nil {
		return Product{}, StockMovement{}, err
	}

	var m StockMovement
	err = tx.QueryRow(ctx, `
		INSERT INTO stock_movements (product_id, type, qty, note)
		VALUES ($1, $2, $3, $4)
		RETURNING id, product_id, type, qty, note, created_at`,
		id, movementType, qty, note).
		Scan(&m.ID, &m.ProductID, &m.Type, &m.Qty, &m.Note, &m.CreatedAt)
	if err != nil {
		return Product{}, StockMovement{}, err
	}

	p, err := scanProduct(tx.QueryRow(ctx, `SELECT `+productColumns+` FROM products p WHERE p.id = $1`, id))
	if err != nil {
		return Product{}, StockMovement{}, err
	}

	return p, m, tx.Commit(ctx)
}

func (s *Store) ListMovements(ctx context.Context, productID int64) ([]StockMovement, error) {
	var exists bool
	if err := s.pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM products WHERE id = $1)`, productID).Scan(&exists); err != nil {
		return nil, err
	}
	if !exists {
		return nil, ErrProductNotFound
	}

	rows, err := s.pool.Query(ctx, `
		SELECT id, product_id, type, qty, note, created_at
		FROM stock_movements
		WHERE product_id = $1
		ORDER BY created_at DESC, id DESC`, productID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	movements := make([]StockMovement, 0, 16)
	for rows.Next() {
		var m StockMovement
		if err := rows.Scan(&m.ID, &m.ProductID, &m.Type, &m.Qty, &m.Note, &m.CreatedAt); err != nil {
			return nil, err
		}
		movements = append(movements, m)
	}
	return movements, rows.Err()
}

// Summary powers the dashboard cards. Everything is aggregated in Postgres so
// the numbers stay correct across pagination.
func (s *Store) Summary(ctx context.Context) (Summary, error) {
	var sum Summary
	err := s.pool.QueryRow(ctx, `
		SELECT
			count(*),
			count(*) FILTER (WHERE is_active),
			COALESCE(sum(stock::bigint * price::bigint), 0),
			count(*) FILTER (WHERE stock <= 10)
		FROM products`).
		Scan(&sum.TotalProducts, &sum.ActiveProducts, &sum.TotalStockValue, &sum.LowStockCount)
	return sum, err
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

// validationDetail is a tiny constructor used by the order validation path.
func validationDetail(field, sku, message string) FieldDetail {
	return FieldDetail{Field: field, SKU: sku, Message: message}
}
