package store

import "context"

type DailySales struct {
	Date        string `json:"date"`
	OrdersCount int64  `json:"orders_count"`
	ItemsSold   int64  `json:"items_sold"`
	Revenue     int64  `json:"revenue"`
}

// DailySales aggregates non-cancelled orders created on the given calendar day
// (server timezone, UTC in the container).
func (s *Store) DailySales(ctx context.Context, date string) (DailySales, error) {
	d := DailySales{Date: date}

	err := s.pool.QueryRow(ctx, `
		SELECT count(*) FILTER (WHERE status = 'CREATED'),
		       COALESCE(sum(total) FILTER (WHERE status = 'CREATED'), 0)
		FROM sales_orders
		WHERE created_at >= $1::date
		  AND created_at <  ($1::date + interval '1 day')`, date).
		Scan(&d.OrdersCount, &d.Revenue)
	if err != nil {
		return DailySales{}, err
	}

	err = s.pool.QueryRow(ctx, `
		SELECT COALESCE(sum(soi.qty), 0)
		FROM sales_order_items soi
		JOIN sales_orders so ON so.id = soi.order_id
		WHERE so.status = 'CREATED'
		  AND so.created_at >= $1::date
		  AND so.created_at <  ($1::date + interval '1 day')`, date).
		Scan(&d.ItemsSold)
	if err != nil {
		return DailySales{}, err
	}

	return d, nil
}
