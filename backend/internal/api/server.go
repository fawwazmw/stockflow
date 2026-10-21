package api

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"strconv"

	"stockflow/backend/internal/store"
)

// Server holds the HTTP dependencies. Handlers are methods so the store and
// logger are never global.
type Server struct {
	store *store.Store
	log   *slog.Logger
}

func NewServer(st *store.Store, log *slog.Logger) *Server {
	return &Server{store: st, log: log}
}

type dataResponse struct {
	Data any `json:"data"`
}

type listResponse struct {
	Data  any   `json:"data"`
	Page  int   `json:"page"`
	Limit int   `json:"limit"`
	Total int64 `json:"total"`
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if payload == nil {
		return
	}
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		// The response is already partially written; nothing useful to do but log.
		slog.Default().Error("encode response", "error", err)
	}
}

func writeNoContent(w http.ResponseWriter) {
	w.WriteHeader(http.StatusNoContent)
}

// decodeJSON limits body size and turns malformed input into a 400.
func decodeJSON(r *http.Request, dst any) error {
	dec := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	if err := dec.Decode(dst); err != nil {
		return &store.ValidationError{Message: "invalid JSON body: " + err.Error()}
	}
	// Reject trailing garbage so `{"a":1}{"b":2}` is not silently accepted.
	if err := dec.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return &store.ValidationError{Message: "request body must contain a single JSON object"}
	}
	return nil
}

// pathID parses {id} and reports a 400 for non-numeric values.
func pathID(r *http.Request) (int64, error) {
	raw := r.PathValue("id")
	id, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || id <= 0 {
		return 0, &store.ValidationError{Message: "id must be a positive integer", Fields: map[string]string{"id": "must be a positive integer"}}
	}
	return id, nil
}

func queryInt(r *http.Request, key string, fallback, min, max int) (int, error) {
	raw := r.URL.Query().Get(key)
	if raw == "" {
		return fallback, nil
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < min || n > max {
		return 0, &store.ValidationError{
			Message: key + " must be an integer between " + strconv.Itoa(min) + " and " + strconv.Itoa(max),
			Fields:  map[string]string{key: "out of range"},
		}
	}
	return n, nil
}
