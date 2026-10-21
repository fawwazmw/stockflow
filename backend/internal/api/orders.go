package api

import (
	"fmt"
	"net/http"
	"strings"

	"stockflow/backend/internal/store"
)

type createOrderItemRequest struct {
	SKU string `json:"sku"`
	Qty *int64 `json:"qty"`
}

type createOrderRequest struct {
	Customer string                   `json:"customer"`
	Items    []createOrderItemRequest `json:"items"`
}

// toInput validates the whole payload before anything touches the database:
// empty items, missing customer, qty <= 0, missing sku and duplicate skus all
// come back as one 400 with per-field details.
func (req createOrderRequest) toInput() (store.CreateOrderInput, error) {
	fields := map[string]string{}
	var details []store.FieldDetail

	customer := strings.TrimSpace(req.Customer)
	switch {
	case customer == "":
		fields["customer"] = "is required"
	case len(customer) > 200:
		fields["customer"] = "must be at most 200 characters"
	}

	if len(req.Items) == 0 {
		fields["items"] = "at least one item is required"
	}

	seen := make(map[string]int, len(req.Items))
	items := make([]store.CreateOrderItem, 0, len(req.Items))

	for i, item := range req.Items {
		sku := strings.TrimSpace(item.SKU)
		field := fmt.Sprintf("items[%d]", i)

		if sku == "" {
			details = append(details, store.FieldDetail{
				Field: field + ".sku", Message: "sku is required",
			})
			continue
		}
		if item.Qty == nil {
			details = append(details, store.FieldDetail{
				Field: field + ".qty", SKU: sku, Message: "qty is required",
			})
			continue
		}
		if *item.Qty <= 0 {
			details = append(details, store.FieldDetail{
				Field: field + ".qty", SKU: sku, Message: "qty must be greater than 0",
			})
			continue
		}
		if prev, dup := seen[sku]; dup {
			details = append(details, store.FieldDetail{
				Field:   field + ".sku",
				SKU:     sku,
				Message: fmt.Sprintf("duplicate sku in the same order (already on item %d)", prev),
			})
			continue
		}
		seen[sku] = i
		items = append(items, store.CreateOrderItem{SKU: sku, Qty: *item.Qty})
	}

	if len(fields) > 0 || len(details) > 0 {
		return store.CreateOrderInput{}, &store.ValidationError{
			Message: "order validation failed",
			Fields:  fields,
			Details: details,
		}
	}

	return store.CreateOrderInput{Customer: customer, Items: items}, nil
}

func (s *Server) handleCreateOrder(w http.ResponseWriter, r *http.Request) {
	var req createOrderRequest
	if err := decodeJSON(r, &req); err != nil {
		s.fail(w, r, err)
		return
	}
	input, err := req.toInput()
	if err != nil {
		s.fail(w, r, err)
		return
	}

	idemKey := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
	if len(idemKey) > 200 {
		s.fail(w, r, &store.ValidationError{
			Message: "Idempotency-Key must be at most 200 characters",
			Fields:  map[string]string{"Idempotency-Key": "too long"},
		})
		return
	}

	order, replayed, err := s.store.CreateOrder(r.Context(), input, idemKey)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if replayed {
		w.Header().Set("Idempotent-Replayed", "true")
	}
	writeJSON(w, http.StatusCreated, dataResponse{Data: order})
}

func (s *Server) handleGetOrder(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	order, err := s.store.GetOrder(r.Context(), id)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, dataResponse{Data: order})
}

func (s *Server) handleCancelOrder(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	order, err := s.store.CancelOrder(r.Context(), id)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, dataResponse{Data: order})
}

func (s *Server) handleListOrders(w http.ResponseWriter, r *http.Request) {
	page, err := queryInt(r, "page", 1, 1, 100000)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	limit, err := queryInt(r, "limit", 20, 1, 100)
	if err != nil {
		s.fail(w, r, err)
		return
	}

	status := r.URL.Query().Get("status")
	if status == "" {
		status = "all"
	}
	switch status {
	case "all", "created", "cancelled":
	default:
		s.fail(w, r, &store.ValidationError{
			Message: "status must be one of all, created, cancelled",
			Fields:  map[string]string{"status": "invalid value"},
		})
		return
	}

	orders, total, err := s.store.ListOrders(r.Context(), store.ListOrdersParams{
		Search: r.URL.Query().Get("search"),
		Status: status,
		Page:   page,
		Limit:  limit,
	})
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, listResponse{Data: orders, Page: page, Limit: limit, Total: total})
}
