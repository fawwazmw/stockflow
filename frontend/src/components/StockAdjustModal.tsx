import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ApiError, adjustStock } from '../api/client'
import type { Product, StockMovementType } from '../api/types'
import { formatNumber } from '../lib/format'
import { validateStockForm, type FieldErrors } from '../lib/validation'
import { Alert } from './Feedback'
import { Modal } from './Modal'

interface StockAdjustModalProps {
  product: Product | null
  onClose: () => void
  onSaved: (updated: Product) => void
}

export function StockAdjustModal({ product, onClose, onSaved }: StockAdjustModalProps) {
  const [type, setType] = useState<StockMovementType>('in')
  const [qty, setQty] = useState('')
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [serverError, setServerError] = useState<ApiError | null>(null)
  const [saving, setSaving] = useState(false)

  // Reset whenever a different product is opened.
  useEffect(() => {
    setType('in')
    setQty('')
    setNote('')
    setErrors({})
    setServerError(null)
    setSaving(false)
  }, [product?.id])

  const nextStock = useMemo(() => {
    if (!product) return 0
    const parsed = Number(qty)
    if (!Number.isFinite(parsed) || parsed <= 0) return product.stock
    return type === 'in' ? product.stock + parsed : product.stock - parsed
  }, [product, qty, type])

  if (!product) return null

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const formErrors = validateStockForm({ type, qty, note })
    if (Object.keys(formErrors).length > 0) {
      setErrors(formErrors)
      return
    }
    setErrors({})
    setServerError(null)
    setSaving(true)
    try {
      const result = await adjustStock(product.id, {
        type,
        qty: Number(qty.trim()),
        note: note.trim() === '' ? undefined : note.trim(),
      })
      onSaved(result.product)
    } catch (error) {
      setServerError(error instanceof ApiError ? error : new ApiError(0, {
        code: 'UNKNOWN_ERROR',
        message: 'Could not save the stock movement',
      }))
    } finally {
      setSaving(false)
    }
  }

  const insufficient = serverError?.isInsufficientStock ? serverError : null

  return (
    <Modal
      open
      title={`Adjust stock — ${product.sku}`}
      onClose={saving ? () => undefined : onClose}
      footer={
        <>
          <button type="button" className="button button-ghost" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="submit" form="stock-form" className="button button-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save movement'}
          </button>
        </>
      }
    >
      <form id="stock-form" onSubmit={handleSubmit} noValidate>
        <p className="modal-subtitle">
          {product.name} · current stock <strong>{product.stock}</strong>
        </p>

        <div className="field">
          <span className="field-label">Direction</span>
          <div className="segmented" role="group" aria-label="Movement direction">
            <button
              type="button"
              className={type === 'in' ? 'segment active' : 'segment'}
              onClick={() => setType('in')}
            >
              Stock in
            </button>
            <button
              type="button"
              className={type === 'out' ? 'segment active' : 'segment'}
              onClick={() => setType('out')}
            >
              Stock out
            </button>
          </div>
        </div>

        <label className="field">
          <span className="field-label">Quantity</span>
          <input
            className={errors.qty ? 'input input-error' : 'input'}
            inputMode="numeric"
            value={qty}
            onChange={(event) => setQty(event.target.value)}
            placeholder="e.g. 5"
            autoFocus
          />
          {errors.qty ? <span className="field-error">{errors.qty}</span> : null}
        </label>

        <label className="field">
          <span className="field-label">
            Note <span className="field-hint">(optional)</span>
          </span>
          <textarea
            className={errors.note ? 'input input-error' : 'input'}
            rows={2}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Restock from distributor, damaged unit, …"
          />
          {errors.note ? <span className="field-error">{errors.note}</span> : null}
        </label>

        <p className={nextStock < 0 ? 'preview preview-warn' : 'preview'}>
          {nextStock < 0 ? (
            <>
              Not enough stock — only <strong>{product.stock}</strong> available.
            </>
          ) : (
            <>
              Stock after saving: <strong>{formatNumber(nextStock)}</strong>
            </>
          )}
        </p>

        {insufficient ? (
          <Alert tone="error" title="Insufficient stock">
            Only <strong>{insufficient.available ?? 0}</strong> unit(s) of {product.sku} are available —
            you tried to take out {insufficient.requested ?? Number(qty)}.
          </Alert>
        ) : null}

        {serverError && !insufficient ? (
          <Alert tone="error" title="Could not save">
            {serverError.message}
          </Alert>
        ) : null}
      </form>
    </Modal>
  )
}
