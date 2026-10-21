import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ApiError, cancelOrder, getOrder } from '../api/client'
import { OrderStatusBadge } from '../components/Badges'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Alert, ErrorState } from '../components/Feedback'
import { SkeletonRows } from '../components/TableBits'
import { useApi } from '../hooks/useApi'
import { formatDateTime, formatIDR } from '../lib/format'

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const orderId = Number(id)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)
  const [justCancelled, setJustCancelled] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const order = useApi(() => getOrder(orderId), [orderId, refreshKey])

  if (!Number.isInteger(orderId) || orderId <= 0) {
    return (
      <div className="page page-narrow">
        <ErrorState message="Invalid order id" onRetry={() => setRefreshKey((k) => k + 1)} />
      </div>
    )
  }

  const handleCancel = async () => {
    setCancelling(true)
    setCancelError(null)
    try {
      await cancelOrder(orderId)
      setConfirmOpen(false)
      setJustCancelled(true)
      setRefreshKey((key) => key + 1)
    } catch (error) {
      if (error instanceof ApiError && error.code === 'ORDER_ALREADY_CANCELLED') {
        setCancelError('This order is already cancelled.')
      } else {
        setCancelError(error instanceof ApiError ? error.message : 'Could not cancel the order')
      }
    } finally {
      setCancelling(false)
    }
  }

  if (order.error && !order.data) {
    return (
      <div className="page page-narrow">
        <div className="page-header">
          <div>
            <h1>Order</h1>
            <p className="page-subtitle">Order detail</p>
          </div>
          <Link className="button button-ghost" to="/orders">
            All orders
          </Link>
        </div>
        <ErrorState message={order.error.message} onRetry={order.refetch} />
      </div>
    )
  }

  if (!order.data) {
    return (
      <div className="page page-narrow">
        <section className="card">
          <table className="table">
            <tbody>
              <SkeletonRows columns={4} rows={4} />
            </tbody>
          </table>
        </section>
      </div>
    )
  }

  const data = order.data
  const isCancelled = data.status === 'CANCELLED'

  return (
    <div className="page page-narrow">
      <div className="page-header">
        <div>
          <h1>Order #{data.id}</h1>
          <p className="page-subtitle">
            {data.customer} · created {formatDateTime(data.created_at)}
          </p>
        </div>
        <div className="page-actions">
          <Link className="button button-ghost" to="/orders">
            All orders
          </Link>
          <Link className="button button-ghost" to="/">
            Products
          </Link>
        </div>
      </div>

      {justCancelled ? (
        <Alert tone="success" title="Order cancelled">
          Stock has been restored for every item. Open the products page to see the updated quantities.
        </Alert>
      ) : null}

      <section className="card">
        <div className="detail-meta">
          <div>
            <span className="metric-label">Status</span>
            <div>
              <OrderStatusBadge status={data.status} />
            </div>
          </div>
          <div>
            <span className="metric-label">Total</span>
            <div className="detail-total tabular">{formatIDR(data.total)}</div>
          </div>
          <div>
            <span className="metric-label">Cancelled at</span>
            <div>{data.cancelled_at ? formatDateTime(data.cancelled_at) : '—'}</div>
          </div>
        </div>

        <div className="table-wrap">
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
              {data.items.map((item) => (
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
                <td className="align-right tabular total-cell">{formatIDR(data.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="form-actions">
          {isCancelled ? (
            <p className="muted">This order was cancelled and its stock was restored.</p>
          ) : (
            <button
              type="button"
              className="button button-danger"
              onClick={() => {
                setCancelError(null)
                setConfirmOpen(true)
              }}
            >
              Cancel order
            </button>
          )}
        </div>
      </section>

      <ConfirmDialog
        open={confirmOpen}
        title={`Cancel order #${data.id}?`}
        message={
          <>
            <p>
              All {data.items.length} line item(s) will be returned to stock and the order will be
              marked as cancelled.
            </p>
            <p className="muted">The order is kept for history — nothing is deleted.</p>
          </>
        }
        confirmLabel="Cancel order"
        busyLabel="Cancelling…"
        busy={cancelling}
        danger
        error={cancelError}
        onCancel={() => {
          setConfirmOpen(false)
          setCancelError(null)
        }}
        onConfirm={handleCancel}
      />
    </div>
  )
}
