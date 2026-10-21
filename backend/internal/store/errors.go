package store

import (
	"errors"
	"fmt"
)

// Domain errors. The API layer is responsible for turning these into the
// documented JSON error envelope; the store never knows about HTTP.

var (
	ErrProductNotFound    = errors.New("product not found")
	ErrOrderNotFound      = errors.New("order not found")
	ErrAlreadyCancelled   = errors.New("order already cancelled")
	ErrIdempotencyReuse   = errors.New("idempotency key reused with a different payload")
	ErrIdempotencyPending = errors.New("a request with this idempotency key is still in flight")
)

// DuplicateSKUError means the sku column is already taken.
type DuplicateSKUError struct {
	SKU string
}

func (e *DuplicateSKUError) Error() string {
	return fmt.Sprintf("sku %q already exists", e.SKU)
}

// ProductHasHistoryError blocks deletes that would orphan the ledger.
type ProductHasHistoryError struct {
	SKU string
}

func (e *ProductHasHistoryError) Error() string {
	return fmt.Sprintf("product %q has movement or order history", e.SKU)
}

// InsufficientStockError is returned when a decrement would overdraw stock.
// It is always produced *after* the failing statement has been rolled back, so
// no partial write survives.
type InsufficientStockError struct {
	SKU       string
	Available int64
	Requested int64
}

func (e *InsufficientStockError) Error() string {
	return fmt.Sprintf("insufficient stock for sku %q: available %d, requested %d", e.SKU, e.Available, e.Requested)
}

// FieldDetail points at one invalid part of a request. The frontend uses SKU
// and Field to highlight the exact row / input that failed.
type FieldDetail struct {
	Field   string `json:"field"`
	SKU     string `json:"sku,omitempty"`
	Message string `json:"message"`
}

// ValidationError is a 400 with machine-readable details.
type ValidationError struct {
	Message string
	Fields  map[string]string
	Details []FieldDetail
}

func (e *ValidationError) Error() string {
	if e.Message != "" {
		return e.Message
	}
	return "validation failed"
}

func fieldError(field, message string) *ValidationError {
	return &ValidationError{
		Message: "validation failed",
		Fields:  map[string]string{field: message},
	}
}
