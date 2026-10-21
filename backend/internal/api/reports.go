package api

import (
	"net/http"
	"time"

	"stockflow/backend/internal/store"
)

func (s *Server) handleDailySales(w http.ResponseWriter, r *http.Request) {
	date := r.URL.Query().Get("date")
	if date == "" {
		date = time.Now().Format("2006-01-02")
	}
	if _, err := time.Parse("2006-01-02", date); err != nil {
		s.fail(w, r, &store.ValidationError{
			Message: "date must use the YYYY-MM-DD format",
			Fields:  map[string]string{"date": "invalid format"},
		})
		return
	}

	report, err := s.store.DailySales(r.Context(), date)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, dataResponse{Data: report})
}
