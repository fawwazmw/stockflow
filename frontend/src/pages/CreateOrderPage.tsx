import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, createOrder, listProducts } from '../api/client'
import type { Order } from '../api/types'
import { Alert, ErrorState } from '../components/Feedback'
import { useApi } from '../hooks/useApi'
import { formatIDR } from '../lib/format'
import {
  validateOrderForm,
  type OrderFormErrors,
  type OrderLineValues,
} from '../lib/validation'

interface Line extends OrderLineValues {
  rowId: string
}

function newRowId(): string {
  return Math.random().toString(36).slice(2, 10)
}

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export function CreateOrderPage() {
  const products = useApi(() => listProducts({ status: 'active', page: 1, limit: 100 }), [])

  const [customer, setCustomer] = useState('')
  const [lines, setLines] = useState<Line[]>([{ rowId: newRowId(), sku: '', qty: '1' }])
  const [errors, setErrors] = useState<OrderFormErrors>({ items: {}, hasErrors: false })
  const [serverError, setServerError] = useState<ApiError | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [createdOrder, setCreatedOrder] = useState<Order | null>(null)

  // One key per distinct payload: an accidental double submit replays the same
  // order server-side instead of creating a second one.
  const idempotency = useRef<{ signature: string; key: string } | null>(null)

  const keyFor = (signature: string): string => {
    if (idempotency.current === null || idempotency.current.signature !== signature) {
      idempotency.current = { signature, key: newIdempotencyKey() }
    }
    return idempotency.current.key
  }

  const updateLine = (rowId: string, patch: Partial<Pick<Line, 'sku' | 'qty'>>) => {
    setLines((prev) => prev.map((line) => (line.rowId === rowId ? { ...line, ...patch } : line)))
  }

  const addLine = () => {
    setLines((prev) => [...prev, { rowId: newRowId(), sku: '', qty: '1' }])
  }

  const removeLine = (rowId: string) => {
    setLines((prev) => (prev.length === 1 ? prev : prev.filter((line) => line.rowId !== rowId)))
  }

  const resetForm = () => {
    setCreatedOrder(null)
    setCustomer('')
    setLines([{ rowId: newRowId(), sku: '', qty: '1' }])
    setErrors({ items: {}, hasErrors: false })
    setServerError(null)
    idempotency.current = null
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setServerError(null)

    const formErrors = validateOrderForm(customer, lines)
    setErrors(formErrors)
    if (formErrors.hasErrors) return

    const payload = {
      customer: customer.trim(),
      items: lines.map((line) => ({ sku: line.sku.trim(), qty: Number(line.qty.trim()) })),
    }

    setSubmitting(true)
    try {
      const order = await createOrder(payload, keyFor(JSON.stringify(payload)))
      setCreatedOrder(order)
    } catch (error) {
      const apiError = error instanceof ApiError
        ? error
        : new ApiError(0, { code: 'UNKNOWN_ERROR', message: 'Could not create the order' })
      setServerError(apiError)
      applyServerErrors(apiError, lines)
    } finally {
      setSubmitting(false)
    }
  }

  /** Maps the backend's details/409 back onto the exact row the user sees. */
  const applyServerErrors = (error: ApiError, currentLines: Line[]) => {
    if (error.isInsufficientStock && error.sku) {
      const row = currentLines.find((line) => line.sku === error.sku)
      if (!row) return
      setErrors((prev) => ({
        ...prev,
        hasErrors: true,
        items: {
          ...prev.items,
          [row.rowId]: {
            qty: `Only ${error.available ?? 0} available for ${error.sku}`,
          },
        },
      }))
      return
    }

    if (error.status === 400 && error.details.length > 0) {
      const nextItems: OrderFormErrors['items'] = {}
      for (const detail of error.details) {
        const match = /^items\[(\d+)\]/.exec(detail.field)
        if (!match) continue
        const index = Number(match[1])
        const row = currentLines[index]
        if (!row) continue
        nextItems[row.rowId] = {
          ...nextItems[row.rowId],
          [detail.field.endsWith('.qty') ? 'qty' : 'sku']: detail.message,
        }
      }
      setErrors((prev) => ({ ...prev, hasErrors: true, items: { ...prev.items, ...nextItems } }))
      if (error.fields.customer) {
        setErrors((prev) => ({ ...prev, customer: error.fields.customer, hasErrors: true }))
      }
    }
  }

  const productOptions = products.data?.data ?? []

  if (createdOrder) {
    return (
      <div className="page page-narrow">
        <div className="page-header">
          <div>
            <h1>Order created</h1>
            <p className="page-subtitle">Stock has been reserved and the total was computed by the server.</p>
          </div>
        </div>

        <section className="card card-success">
          <Alert tone="success" title={`Order #${createdOrder.id} created`}>
            {createdOrder.customer} · {formatIDR(createdOrder.total)}
          </Alert>

          <table className="table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Product</th>
                <th className="align-right">Qty</th>
                <th className="align-right">Unit price</th>
                <th className="align-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {createdOrder.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <code className="sku">{item.sku}</code>
                  </td>
                  <td>{item.product_name}</td>
                  <td className="align-right">{item.qty}</td>
                  <td className="align-right tabular">{formatIDR(item.unit_price)}</td>
                  <td className="align-right tabular">{formatIDR(item.subtotal)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={4} className="align-right">
                  Total
                </td>
                <td className="align-right tabular total-cell">{formatIDR(createdOrder.total)}</td>
              </tr>
            </tfoot>
          </table>

          <div className="form-actions">
            <Link className="button button-primary" to={`/orders/${createdOrder.id}`}>
              View order
            </Link>
            <button type="button" className="button button-ghost" onClick={resetForm}>
              Create another
            </button>
            <Link className="button button-ghost" to="/">
              Back to products
            </Link>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="page page-narrow">
      <div className="page-header">
        <div>
          <h1>New order</h1>
          <p className="page-subtitle">
            Prices and totals come from the server. Stock is reserved atomically for every line.
          </p>
        </div>
        <Link className="button button-ghost" to="/orders">
          All orders
        </Link>
      </div>

      {products.error ? (
        <ErrorState message={products.error.message} onRetry={products.refetch} />
      ) : (
        <form className="card" onSubmit={handleSubmit} noValidate>
          <label className="field">
            <span className="field-label">Customer</span>
            <input
              className={errors.customer ? 'input input-error' : 'input'}
              value={customer}
              onChange={(event) => setCustomer(event.target.value)}
              placeholder="e.g. CV Sinar Abadi"
              autoFocus
            />
            {errors.customer ? <span className="field-error">{errors.customer}</span> : null}
          </label>

          <div className="order-lines">
            <div className="order-lines-head">
              <span>Product</span>
              <span>Qty</span>
              <span />
            </div>

            {lines.map((line) => {
              const lineErrors = errors.items[line.rowId]
              return (
                <div
                  key={line.rowId}
                  className={lineErrors ? 'order-line has-error' : 'order-line'}
                >
                  <div className="field">
                    <select
                      className={lineErrors?.sku ? 'input input-error' : 'input'}
                      value={line.sku}
                      onChange={(event) => updateLine(line.rowId, { sku: event.target.value })}
                      disabled={products.loading && productOptions.length === 0}
                    >
                      <option value="">Select a product…</option>
                      {productOptions.map((product) => (
                        <option key={product.id} value={product.sku}>
                          {product.sku} — {product.name} ({product.stock} in stock)
                        </option>
                      ))}
                    </select>
                    {lineErrors?.sku ? <span className="field-error">{lineErrors.sku}</span> : null}
                  </div>

                  <div className="field">
                    <input
                      className={lineErrors?.qty ? 'input input-error' : 'input'}
                      inputMode="numeric"
                      value={line.qty}
                      onChange={(event) => updateLine(line.rowId, { qty: event.target.value })}
                      aria-label="Quantity"
                    />
                    {lineErrors?.qty ? <span className="field-error">{lineErrors.qty}</span> : null}
                  </div>

                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => removeLine(line.rowId)}
                    disabled={lines.length === 1}
                    aria-label="Remove line"
                  >
                    ×
                  </button>
                </div>
              )
            })}
          </div>

          <button type="button" className="button button-ghost" onClick={addLine} disabled={submitting}>
            + Add item
          </button>

          {serverError ? (
            <Alert tone="error" title={serverError.isInsufficientStock ? 'Insufficient stock' : 'Order rejected'}>
              {serverError.isInsufficientStock ? (
                <span>
                  {serverError.sku} only has <strong>{serverError.available ?? 0}</strong> unit(s)
                  available — nothing was deducted.
                </span>
              ) : (
                <span>{serverError.message}</span>
              )}
            </Alert>
          ) : null}

          <div className="form-actions">
            <button type="submit" className="button button-primary" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create order'}
            </button>
            <Link className="button button-ghost" to="/">
              Cancel
            </Link>
          </div>
        </form>
      )}
    </div>
  )
}
