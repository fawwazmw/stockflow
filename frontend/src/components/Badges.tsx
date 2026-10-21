import type { OrderStatus } from '../api/types'

/**
 * Statuses are squared stamps, not pills: a rubber stamp in a stock register.
 * Every stamp carries a word, so colour is never the only signal.
 */
export function ProductStatusBadge({ active }: { active: boolean }) {
  return (
    <span className={active ? 'badge badge-green' : 'badge badge-gray'}>
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

export function StockCell({ stock }: { stock: number }) {
  const tone = stock === 0 ? 'stock-number-out' : stock <= 10 ? 'stock-number-low' : undefined

  return (
    <span className="stock-cell">
      <span className={tone}>{stock}</span>
      {stock === 0 ? (
        <span className="badge badge-red">Out</span>
      ) : stock <= 10 ? (
        <span className="badge badge-amber">Low</span>
      ) : null}
    </span>
  )
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={status === 'CREATED' ? 'badge badge-blue' : 'badge badge-gray'}>
      {status === 'CREATED' ? 'Created' : 'Cancelled'}
    </span>
  )
}
