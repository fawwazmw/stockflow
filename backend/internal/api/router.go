package api

import (
	"net/http"

	"stockflow/backend/internal/config"
)

// Router wires the documented contract plus a few additive endpoints the UI
// needs (summary, order list, daily sales). Extensions are listed in the README.
func (s *Server) Router(cfg config.Config) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", s.handleHealth)

	mux.HandleFunc("GET /api/products", s.handleListProducts)
	mux.HandleFunc("POST /api/products", s.handleCreateProduct)
	mux.HandleFunc("GET /api/products/summary", s.handleSummary)
	mux.HandleFunc("GET /api/products/{id}", s.handleGetProduct)
	mux.HandleFunc("PUT /api/products/{id}", s.handleUpdateProduct)
	mux.HandleFunc("DELETE /api/products/{id}", s.handleDeleteProduct)
	mux.HandleFunc("POST /api/products/{id}/stock", s.handleAdjustStock)
	mux.HandleFunc("GET /api/products/{id}/movements", s.handleListMovements)

	mux.HandleFunc("GET /api/orders", s.handleListOrders)
	mux.HandleFunc("POST /api/orders", s.handleCreateOrder)
	mux.HandleFunc("GET /api/orders/{id}", s.handleGetOrder)
	mux.HandleFunc("POST /api/orders/{id}/cancel", s.handleCancelOrder)

	mux.HandleFunc("GET /api/reports/daily-sales", s.handleDailySales)

	// Anything unmatched gets the same JSON envelope instead of Go's text 404.
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusNotFound, errorEnvelope{Error: errorPayload{
			Code: "NOT_FOUND", Message: "route not found",
		}})
	})

	var handler http.Handler = mux
	handler = s.withCORS(cfg.CORSOrigins)(handler)
	handler = s.withLogging(handler)
	handler = s.withRecover(handler)
	return handler
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if err := s.store.Ping(r.Context()); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "unhealthy"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
