package api

import (
	"errors"
	"net/http"

	"stockflow/backend/internal/store"
)

// errorPayload is the single error envelope used by every endpoint.
// Extra fields (sku, available, requested) sit next to code/message so the
// documented contract {"error":{"code":"INSUFFICIENT_STOCK","available":n}} holds.
type errorPayload struct {
	Code      string              `json:"code"`
	Message   string              `json:"message"`
	Fields    map[string]string   `json:"fields,omitempty"`
	Details   []store.FieldDetail `json:"details,omitempty"`
	SKU       string              `json:"sku,omitempty"`
	Available *int64              `json:"available,omitempty"`
	Requested *int64              `json:"requested,omitempty"`
}

type errorEnvelope struct {
	Error errorPayload `json:"error"`
}

func (s *Server) fail(w http.ResponseWriter, r *http.Request, err error) {
	var (
		status  = http.StatusInternalServerError
		payload = errorPayload{Code: "INTERNAL_ERROR", Message: "internal server error"}
	)

	var validationErr *store.ValidationError
	var duplicate *store.DuplicateSKUError
	var hasHistory *store.ProductHasHistoryError
	var insufficient *store.InsufficientStockError

	switch {
	case errors.As(err, &validationErr):
		status = http.StatusBadRequest
		payload = errorPayload{Code: "VALIDATION_FAILED", Message: validationErr.Error()}
		payload.Fields = validationErr.Fields
		payload.Details = validationErr.Details

	case errors.As(err, &duplicate):
		status = http.StatusConflict
		payload = errorPayload{
			Code:    "SKU_ALREADY_EXISTS",
			Message: "sku " + duplicate.SKU + " is already in use",
			SKU:     duplicate.SKU,
		}

	case errors.As(err, &hasHistory):
		status = http.StatusConflict
		payload = errorPayload{
			Code:    "PRODUCT_HAS_HISTORY",
			Message: "product has stock movement or order history and cannot be deleted",
			SKU:     hasHistory.SKU,
		}

	case errors.As(err, &insufficient):
		status = http.StatusConflict
		available, requested := insufficient.Available, insufficient.Requested
		payload = errorPayload{
			Code:      "INSUFFICIENT_STOCK",
			Message:   "not enough stock for sku " + insufficient.SKU,
			SKU:       insufficient.SKU,
			Available: &available,
			Requested: &requested,
		}

	case errors.Is(err, store.ErrProductNotFound):
		status = http.StatusNotFound
		payload = errorPayload{Code: "PRODUCT_NOT_FOUND", Message: "product not found"}

	case errors.Is(err, store.ErrOrderNotFound):
		status = http.StatusNotFound
		payload = errorPayload{Code: "ORDER_NOT_FOUND", Message: "order not found"}

	case errors.Is(err, store.ErrAlreadyCancelled):
		status = http.StatusConflict
		payload = errorPayload{Code: "ORDER_ALREADY_CANCELLED", Message: "order is already cancelled"}

	case errors.Is(err, store.ErrIdempotencyReuse):
		status = http.StatusConflict
		payload = errorPayload{
			Code:    "IDEMPOTENCY_KEY_REUSED",
			Message: "this Idempotency-Key was already used with a different payload",
		}

	case errors.Is(err, store.ErrIdempotencyPending):
		status = http.StatusConflict
		payload = errorPayload{
			Code:    "IDEMPOTENCY_IN_PROGRESS",
			Message: "a request with this Idempotency-Key is still in progress",
		}
	}

	if status >= http.StatusInternalServerError {
		s.log.ErrorContext(r.Context(), "request failed",
			"method", r.Method, "path", r.URL.Path, "error", err)
		payload = errorPayload{Code: "INTERNAL_ERROR", Message: "internal server error"}
	}

	writeJSON(w, status, errorEnvelope{Error: payload})
}

func (s *Server) badRequest(w http.ResponseWriter, message string) {
	writeJSON(w, http.StatusBadRequest, errorEnvelope{Error: errorPayload{
		Code: "VALIDATION_FAILED", Message: message,
	}})
}

func (s *Server) logInternal(r *http.Request, msg string, err error) {
	s.log.ErrorContext(r.Context(), msg, "error", err, "path", r.URL.Path)
}
