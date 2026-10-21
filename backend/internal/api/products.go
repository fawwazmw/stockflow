package api

import (
	"net/http"
	"strings"

	"stockflow/backend/internal/store"
)

type productRequest struct {
	SKU      string `json:"sku"`
	Name     string `json:"name"`
	Price    *int64 `json:"price"`
	Stock    *int64 `json:"stock"`
	IsActive *bool  `json:"is_active"`
}

func (req productRequest) toInput() (store.ProductInput, error) {
	fields := map[string]string{}

	sku := strings.TrimSpace(req.SKU)
	switch {
	case sku == "":
		fields["sku"] = "is required"
	case len(sku) > 64:
		fields["sku"] = "must be at most 64 characters"
	}

	name := strings.TrimSpace(req.Name)
	switch {
	case name == "":
		fields["name"] = "is required"
	case len(name) > 200:
		fields["name"] = "must be at most 200 characters"
	}

	var price int64
	switch {
	case req.Price == nil:
		fields["price"] = "is required"
	case *req.Price < 0:
		fields["price"] = "must be >= 0"
	default:
		price = *req.Price
	}

	var stock int64
	if req.Stock != nil {
		if *req.Stock < 0 {
			fields["stock"] = "must be >= 0"
		} else {
			stock = *req.Stock
		}
	}

	isActive := true
	if req.IsActive != nil {
		isActive = *req.IsActive
	}

	if len(fields) > 0 {
		return store.ProductInput{}, &store.ValidationError{Message: "validation failed", Fields: fields}
	}
	return store.ProductInput{
		SKU: sku, Name: name, Price: price, Stock: stock, IsActive: isActive,
	}, nil
}

func (s *Server) handleListProducts(w http.ResponseWriter, r *http.Request) {
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
	case "all", "active", "inactive", "low":
	default:
		s.fail(w, r, &store.ValidationError{
			Message: "status must be one of all, active, inactive, low",
			Fields:  map[string]string{"status": "invalid value"},
		})
		return
	}

	products, total, err := s.store.ListProducts(r.Context(), store.ListProductsParams{
		Search: r.URL.Query().Get("search"),
		Status: status,
		Page:   page,
		Limit:  limit,
	})
	if err != nil {
		s.fail(w, r, err)
		return
	}

	writeJSON(w, http.StatusOK, listResponse{Data: products, Page: page, Limit: limit, Total: total})
}

func (s *Server) handleGetProduct(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	product, err := s.store.GetProduct(r.Context(), id)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, dataResponse{Data: product})
}

func (s *Server) handleCreateProduct(w http.ResponseWriter, r *http.Request) {
	var req productRequest
	if err := decodeJSON(r, &req); err != nil {
		s.fail(w, r, err)
		return
	}
	input, err := req.toInput()
	if err != nil {
		s.fail(w, r, err)
		return
	}

	product, err := s.store.CreateProduct(r.Context(), input)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, dataResponse{Data: product})
}

func (s *Server) handleUpdateProduct(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		s.fail(w, r, err)
		return
	}

	var req productRequest
	if err := decodeJSON(r, &req); err != nil {
		s.fail(w, r, err)
		return
	}
	input, err := req.toInput()
	if err != nil {
		s.fail(w, r, err)
		return
	}

	product, err := s.store.UpdateProduct(r.Context(), id, store.UpdateProductInput{
		SKU: input.SKU, Name: input.Name, Price: input.Price, IsActive: input.IsActive,
	})
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, dataResponse{Data: product})
}

func (s *Server) handleDeleteProduct(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	if err := s.store.DeleteProduct(r.Context(), id); err != nil {
		s.fail(w, r, err)
		return
	}
	writeNoContent(w)
}

type adjustStockRequest struct {
	Type string  `json:"type"`
	Qty  *int64  `json:"qty"`
	Note *string `json:"note"`
}

func (s *Server) handleAdjustStock(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		s.fail(w, r, err)
		return
	}

	var req adjustStockRequest
	if err := decodeJSON(r, &req); err != nil {
		s.fail(w, r, err)
		return
	}

	fields := map[string]string{}
	if req.Type != "in" && req.Type != "out" {
		fields["type"] = `must be "in" or "out"`
	}
	if req.Qty == nil {
		fields["qty"] = "is required"
	} else if *req.Qty <= 0 {
		fields["qty"] = "must be greater than 0"
	}
	if req.Note != nil && len(*req.Note) > 500 {
		fields["note"] = "must be at most 500 characters"
	}
	if len(fields) > 0 {
		s.fail(w, r, &store.ValidationError{Message: "validation failed", Fields: fields})
		return
	}

	var note *string
	if req.Note != nil && strings.TrimSpace(*req.Note) != "" {
		trimmed := strings.TrimSpace(*req.Note)
		note = &trimmed
	}

	product, movement, err := s.store.AdjustStock(r.Context(), id, req.Type, *req.Qty, note)
	if err != nil {
		s.fail(w, r, err)
		return
	}

	writeJSON(w, http.StatusOK, dataResponse{Data: map[string]any{
		"product":  product,
		"movement": movement,
	}})
}

func (s *Server) handleListMovements(w http.ResponseWriter, r *http.Request) {
	id, err := pathID(r)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	movements, err := s.store.ListMovements(r.Context(), id)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, dataResponse{Data: movements})
}

func (s *Server) handleSummary(w http.ResponseWriter, r *http.Request) {
	summary, err := s.store.Summary(r.Context())
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, dataResponse{Data: summary})
}
