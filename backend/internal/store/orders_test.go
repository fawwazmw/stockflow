package store

import (
	"context"
	"errors"
	"strconv"
	"sync"
	"testing"
)

func TestCreateOrderHappyPathWritesMovementAndStock(t *testing.T) {
	st := testStore(t)
	ctx := context.Background()

	keyboard := mustCreateProduct(t, st, "KEY-001", 500_000, 10, true)
	mouse := mustCreateProduct(t, st, "MSE-001", 250_000, 5, true)

	order, replayed, err := st.CreateOrder(ctx, CreateOrderInput{
		Customer: "CV Sinar Abadi",
		Items: []CreateOrderItem{
			{SKU: "KEY-001", Qty: 2},
			{SKU: "MSE-001", Qty: 1},
		},
	}, "")
	if err != nil {
		t.Fatalf("create order: %v", err)
	}
	if replayed {
		t.Fatal("unexpected replay on first request")
	}

	// Total and unit prices are computed from the products table.
	if want := int64(2*500_000 + 250_000); order.Total != want {
		t.Fatalf("total = %d, want %d", order.Total, want)
	}
	if order.Status != "CREATED" {
		t.Fatalf("status = %q, want CREATED", order.Status)
	}
	if len(order.Items) != 2 {
		t.Fatalf("items = %d, want 2", len(order.Items))
	}
	for _, item := range order.Items {
		switch item.SKU {
		case "KEY-001":
			if item.UnitPrice != 500_000 || item.Subtotal != 1_000_000 {
				t.Fatalf("KEY-001 item = %+v", item)
			}
		case "MSE-001":
			if item.UnitPrice != 250_000 || item.Subtotal != 250_000 {
				t.Fatalf("MSE-001 item = %+v", item)
			}
		default:
			t.Fatalf("unexpected sku %q", item.SKU)
		}
	}

	if got := stockOf(t, st, keyboard.ID); got != 8 {
		t.Fatalf("keyboard stock = %d, want 8", got)
	}
	if got := stockOf(t, st, mouse.ID); got != 4 {
		t.Fatalf("mouse stock = %d, want 4", got)
	}

	// Exactly one "out" movement per line, linked to the order.
	var movements int64
	err = st.pool.QueryRow(ctx,
		`SELECT count(*) FROM stock_movements WHERE type = 'out' AND note = $1`,
		"Sales order #"+itoa(order.ID)).Scan(&movements)
	if err != nil {
		t.Fatalf("count movements: %v", err)
	}
	if movements != 2 {
		t.Fatalf("out movements = %d, want 2", movements)
	}

	// The order is readable again with the same shape.
	loaded, err := st.GetOrder(ctx, order.ID)
	if err != nil {
		t.Fatalf("get order: %v", err)
	}
	if loaded.Total != order.Total || len(loaded.Items) != 2 {
		t.Fatalf("loaded order = %+v", loaded)
	}
	if loaded.Items[0].ProductName == "" {
		t.Fatal("order items should include the product name")
	}
}

func TestCreateOrderInsufficientStockWritesNothing(t *testing.T) {
	st := testStore(t)
	ctx := context.Background()

	first := mustCreateProduct(t, st, "AAA-001", 1_000, 10, true)
	second := mustCreateProduct(t, st, "BBB-001", 2_000, 1, true)

	ordersBefore := countRows(t, st, "sales_orders")
	itemsBefore := countRows(t, st, "sales_order_items")
	movementsBefore := countRows(t, st, "stock_movements")

	_, _, err := st.CreateOrder(ctx, CreateOrderInput{
		Customer: "PT Gagal",
		Items: []CreateOrderItem{
			{SKU: "AAA-001", Qty: 2}, // would succeed on its own
			{SKU: "BBB-001", Qty: 5}, // but this line cannot be filled
		},
	}, "")

	var insufficient *InsufficientStockError
	if !errors.As(err, &insufficient) {
		t.Fatalf("err = %v, want InsufficientStockError", err)
	}
	if insufficient.SKU != "BBB-001" {
		t.Fatalf("sku = %q, want BBB-001", insufficient.SKU)
	}
	if insufficient.Available != 1 {
		t.Fatalf("available = %d, want 1", insufficient.Available)
	}

	// The whole transaction rolled back: no stock change, no rows at all.
	if got := stockOf(t, st, first.ID); got != 10 {
		t.Fatalf("first stock = %d, want 10 (partial write leaked)", got)
	}
	if got := stockOf(t, st, second.ID); got != 1 {
		t.Fatalf("second stock = %d, want 1", got)
	}
	if got := countRows(t, st, "sales_orders"); got != ordersBefore {
		t.Fatalf("orders = %d, want %d", got, ordersBefore)
	}
	if got := countRows(t, st, "sales_order_items"); got != itemsBefore {
		t.Fatalf("order items = %d, want %d", got, itemsBefore)
	}
	if got := countRows(t, st, "stock_movements"); got != movementsBefore {
		t.Fatalf("movements = %d, want %d", got, movementsBefore)
	}
}

// go test -race ./... should stay clean: the guarded UPDATE is the only place
// stock changes, so concurrent orders serialise on the row lock.
func TestConcurrentOrdersNeverOversell(t *testing.T) {
	st := testStore(t)
	ctx := context.Background()

	product := mustCreateProduct(t, st, "RACE-001", 10_000, 5, true)

	const attempts = 20
	var (
		wg        sync.WaitGroup
		mu        sync.Mutex
		created   int
		conflicts int
		failures  []error
	)

	wg.Add(attempts)
	for i := 0; i < attempts; i++ {
		go func() {
			defer wg.Done()
			_, _, err := st.CreateOrder(ctx, CreateOrderInput{
				Customer: "Concurrent Buyer",
				Items:    []CreateOrderItem{{SKU: "RACE-001", Qty: 1}},
			}, "")

			mu.Lock()
			defer mu.Unlock()
			switch {
			case err == nil:
				created++
			case isInsufficient(err):
				conflicts++
			default:
				failures = append(failures, err)
			}
		}()
	}
	wg.Wait()

	if len(failures) > 0 {
		t.Fatalf("unexpected errors: %v", failures)
	}
	if created != 5 {
		t.Fatalf("created = %d, want exactly 5", created)
	}
	if conflicts != attempts-5 {
		t.Fatalf("conflicts = %d, want %d", conflicts, attempts-5)
	}
	if got := stockOf(t, st, product.ID); got != 0 {
		t.Fatalf("final stock = %d, want 0", got)
	}
	if got := countRows(t, st, "sales_orders"); got != 5 {
		t.Fatalf("orders = %d, want 5", got)
	}
}

func TestCancelOrderRestoresStock(t *testing.T) {
	st := testStore(t)
	ctx := context.Background()

	product := mustCreateProduct(t, st, "CAN-001", 1_000, 10, true)
	order, _, err := st.CreateOrder(ctx, CreateOrderInput{
		Customer: "Toko Berkah",
		Items:    []CreateOrderItem{{SKU: "CAN-001", Qty: 4}},
	}, "")
	if err != nil {
		t.Fatalf("create order: %v", err)
	}
	if got := stockOf(t, st, product.ID); got != 6 {
		t.Fatalf("stock after order = %d, want 6", got)
	}

	cancelled, err := st.CancelOrder(ctx, order.ID)
	if err != nil {
		t.Fatalf("cancel: %v", err)
	}
	if cancelled.Status != "CANCELLED" || cancelled.CancelledAt == nil {
		t.Fatalf("cancelled order = %+v", cancelled)
	}
	if got := stockOf(t, st, product.ID); got != 10 {
		t.Fatalf("stock after cancel = %d, want 10", got)
	}

	var restore int64
	if err := st.pool.QueryRow(ctx,
		`SELECT count(*) FROM stock_movements WHERE type = 'in' AND note = $1`,
		"Cancelled order #"+itoa(order.ID)).Scan(&restore); err != nil {
		t.Fatalf("count restore movements: %v", err)
	}
	if restore != 1 {
		t.Fatalf("restore movements = %d, want 1", restore)
	}

	// Cancelling twice must not restore stock twice.
	if _, err := st.CancelOrder(ctx, order.ID); !errors.Is(err, ErrAlreadyCancelled) {
		t.Fatalf("second cancel err = %v, want ErrAlreadyCancelled", err)
	}
	if got := stockOf(t, st, product.ID); got != 10 {
		t.Fatalf("stock after double cancel = %d, want 10", got)
	}
}

func TestAdjustStockRejectsOverdrawWithoutWriting(t *testing.T) {
	st := testStore(t)
	ctx := context.Background()

	product := mustCreateProduct(t, st, "ADJ-001", 5_000, 3, true)
	before := countRows(t, st, "stock_movements")

	_, _, err := st.AdjustStock(ctx, product.ID, "out", 4, nil)
	var insufficient *InsufficientStockError
	if !errors.As(err, &insufficient) {
		t.Fatalf("err = %v, want InsufficientStockError", err)
	}
	if insufficient.Available != 3 {
		t.Fatalf("available = %d, want 3", insufficient.Available)
	}
	if got := stockOf(t, st, product.ID); got != 3 {
		t.Fatalf("stock = %d, want 3", got)
	}
	if got := countRows(t, st, "stock_movements"); got != before {
		t.Fatalf("movements = %d, want %d", got, before)
	}

	// A valid decrement writes one movement and updates the row.
	updated, movement, err := st.AdjustStock(ctx, product.ID, "out", 2, ptr("Picked for demo"))
	if err != nil {
		t.Fatalf("valid adjust: %v", err)
	}
	if updated.Stock != 1 || movement.Type != "out" || movement.Qty != 2 {
		t.Fatalf("updated = %+v movement = %+v", updated, movement)
	}
}

func TestDeleteProductKeepsHistory(t *testing.T) {
	st := testStore(t)
	ctx := context.Background()

	withHistory := mustCreateProduct(t, st, "HIS-001", 1_000, 5, true)
	fresh := mustCreateProduct(t, st, "NEW-001", 1_000, 0, true)

	err := st.DeleteProduct(ctx, withHistory.ID)
	var hasHistory *ProductHasHistoryError
	if !errors.As(err, &hasHistory) {
		t.Fatalf("err = %v, want ProductHasHistoryError", err)
	}
	if got := countRows(t, st, "products"); got != 2 {
		t.Fatalf("products = %d, want 2", got)
	}

	if err := st.DeleteProduct(ctx, fresh.ID); err != nil {
		t.Fatalf("delete product without history: %v", err)
	}
	if got := countRows(t, st, "products"); got != 1 {
		t.Fatalf("products = %d, want 1", got)
	}
}

func TestCreateOrderRejectsUnknownAndInactiveSKUs(t *testing.T) {
	st := testStore(t)
	ctx := context.Background()

	mustCreateProduct(t, st, "ACT-001", 1_000, 5, true)
	mustCreateProduct(t, st, "INA-001", 1_000, 5, false)

	_, _, err := st.CreateOrder(ctx, CreateOrderInput{
		Customer: "Bad Order",
		Items: []CreateOrderItem{
			{SKU: "NOPE-999", Qty: 1},
			{SKU: "INA-001", Qty: 1},
		},
	}, "")

	var validation *ValidationError
	if !errors.As(err, &validation) {
		t.Fatalf("err = %v, want ValidationError", err)
	}
	if len(validation.Details) != 2 {
		t.Fatalf("details = %+v, want 2 entries", validation.Details)
	}
	if got := countRows(t, st, "sales_orders"); got != 0 {
		t.Fatalf("orders = %d, want 0", got)
	}
}

func TestIdempotencyKeyReplaysTheSameOrder(t *testing.T) {
	st := testStore(t)
	ctx := context.Background()

	mustCreateProduct(t, st, "IDM-001", 2_000, 10, true)
	input := CreateOrderInput{
		Customer: "Retry Buyer",
		Items:    []CreateOrderItem{{SKU: "IDM-001", Qty: 3}},
	}

	first, replayed, err := st.CreateOrder(ctx, input, "key-abc")
	if err != nil {
		t.Fatalf("first create: %v", err)
	}
	if replayed {
		t.Fatal("first request must not be a replay")
	}

	second, replayed, err := st.CreateOrder(ctx, input, "key-abc")
	if err != nil {
		t.Fatalf("replay create: %v", err)
	}
	if !replayed {
		t.Fatal("second request with same key should be a replay")
	}
	if second.ID != first.ID {
		t.Fatalf("replayed order id = %d, want %d", second.ID, first.ID)
	}
	if got := countRows(t, st, "sales_orders"); got != 1 {
		t.Fatalf("orders = %d, want 1", got)
	}

	// Same key, different payload is a conflict.
	_, _, err = st.CreateOrder(ctx, CreateOrderInput{
		Customer: "Retry Buyer",
		Items:    []CreateOrderItem{{SKU: "IDM-001", Qty: 4}},
	}, "key-abc")
	if !errors.Is(err, ErrIdempotencyReuse) {
		t.Fatalf("err = %v, want ErrIdempotencyReuse", err)
	}
}

func TestListProductsSearchFilterAndLastMovement(t *testing.T) {
	st := testStore(t)
	ctx := context.Background()

	mustCreateProduct(t, st, "KEY-001", 1_000, 5, true)
	mustCreateProduct(t, st, "MSE-001", 1_000, 50, true)
	mustCreateProduct(t, st, "OLD-001", 1_000, 2, false)
	mustCreateProduct(t, st, "EMP-001", 1_000, 0, true)

	// Case-insensitive sku match.
	list, total, err := st.ListProducts(ctx, ListProductsParams{Search: "key", Status: "all", Page: 1, Limit: 10})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if total != 1 || len(list) != 1 || list[0].SKU != "KEY-001" {
		t.Fatalf("search result = %+v total=%d", list, total)
	}
	if list[0].LastMovementAt == nil {
		t.Fatal("product with an opening movement should have last_movement_at")
	}

	// Empty search returns everything, paginated.
	_, total, err = st.ListProducts(ctx, ListProductsParams{Status: "all", Page: 1, Limit: 2})
	if err != nil {
		t.Fatalf("list all: %v", err)
	}
	if total != 4 {
		t.Fatalf("total = %d, want 4", total)
	}

	// Status filters.
	if _, total, _ = st.ListProducts(ctx, ListProductsParams{Status: "inactive", Page: 1, Limit: 10}); total != 1 {
		t.Fatalf("inactive total = %d, want 1", total)
	}
	low, total, err := st.ListProducts(ctx, ListProductsParams{Status: "low", Page: 1, Limit: 10})
	if err != nil {
		t.Fatalf("low list: %v", err)
	}
	if total != 3 { // KEY-001 (5), OLD-001 (2), EMP-001 (0)
		t.Fatalf("low total = %d, want 3 (%+v)", total, low)
	}

	// Wildcards in the search are treated literally.
	if _, total, _ = st.ListProducts(ctx, ListProductsParams{Search: "%", Status: "all", Page: 1, Limit: 10}); total != 0 {
		t.Fatalf(`search "%%" total = %d, want 0`, total)
	}

	// A product with no movements reports null.
	empty, err := st.GetProductBySKU(ctx, "EMP-001")
	if err != nil {
		t.Fatalf("get EMP-001: %v", err)
	}
	if empty.LastMovementAt != nil {
		t.Fatalf("last_movement_at = %v, want nil", empty.LastMovementAt)
	}
}

func isInsufficient(err error) bool {
	var target *InsufficientStockError
	return errors.As(err, &target)
}

func itoa(v int64) string { return strconv.FormatInt(v, 10) }

func ptr[T any](v T) *T { return &v }

func TestListOrdersSearchAndStatus(t *testing.T) {
	st := testStore(t)
	ctx := context.Background()

	mustCreateProduct(t, st, "ORD-001", 1_000, 100, true)

	live, _, err := st.CreateOrder(ctx, CreateOrderInput{
		Customer: "Orchard Supply Co.",
		Items:    []CreateOrderItem{{SKU: "ORD-001", Qty: 1}},
	}, "")
	if err != nil {
		t.Fatalf("create live order: %v", err)
	}

	dropped, _, err := st.CreateOrder(ctx, CreateOrderInput{
		Customer: "Tampines Trading",
		Items:    []CreateOrderItem{{SKU: "ORD-001", Qty: 2}},
	}, "")
	if err != nil {
		t.Fatalf("create cancelled order: %v", err)
	}
	if _, err := st.CancelOrder(ctx, dropped.ID); err != nil {
		t.Fatalf("cancel order: %v", err)
	}

	all, total, err := st.ListOrders(ctx, ListOrdersParams{Status: "all", Page: 1, Limit: 10})
	if err != nil {
		t.Fatalf("list all: %v", err)
	}
	if total != 2 || len(all) != 2 {
		t.Fatalf("all: total=%d len=%d, want 2/2", total, len(all))
	}

	// Search is a case-insensitive substring match on the customer name.
	bySearch, total, err := st.ListOrders(ctx, ListOrdersParams{
		Search: "orchard", Status: "all", Page: 1, Limit: 10,
	})
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if total != 1 || len(bySearch) != 1 || bySearch[0].ID != live.ID {
		t.Fatalf("search: total=%d got=%+v want order %d", total, bySearch, live.ID)
	}

	onlyLive, total, err := st.ListOrders(ctx, ListOrdersParams{Status: "created", Page: 1, Limit: 10})
	if err != nil {
		t.Fatalf("status created: %v", err)
	}
	if total != 1 || onlyLive[0].ID != live.ID {
		t.Fatalf("status created: total=%d got=%+v", total, onlyLive)
	}

	onlyDropped, total, err := st.ListOrders(ctx, ListOrdersParams{Status: "cancelled", Page: 1, Limit: 10})
	if err != nil {
		t.Fatalf("status cancelled: %v", err)
	}
	if total != 1 || onlyDropped[0].ID != dropped.ID {
		t.Fatalf("status cancelled: total=%d got=%+v", total, onlyDropped)
	}

	// The total counts every match, not just the requested page.
	_, total, err = st.ListOrders(ctx, ListOrdersParams{Status: "all", Page: 2, Limit: 1})
	if err != nil {
		t.Fatalf("second page: %v", err)
	}
	if total != 2 {
		t.Fatalf("second page total = %d, want 2", total)
	}
}
