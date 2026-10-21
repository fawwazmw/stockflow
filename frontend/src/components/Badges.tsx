import type { OrderStatus } from '../api/types'

export function ProductStatusBadge({ active }: { active: boolean }) {
  return (
    <span className={active ? 'badge badge-green' : 'badge badge-gray'}>
      {active ? 'Active' : 'Inactive'}
    </span>
  )
}

export function StockCell({ stock }: { stock: number }) {
  if (stock === 0) {
    return (
      <span className="stock-cell">
        <strong>0</strong>
        <span className="badge badge-red">out</span>
      </span>
    )
  }
  if (stock <= 10) {
    return (
      <span className="stock-cell">
        <strong>{stock}</strong>
        <span className="badge badge-amber">low</span>
      </span>
    )
  }
  return <span className="stock-cell">{stock}</span>
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={status === 'CREATED' ? 'badge badge-blue' : 'badge badge-gray'}>
      {status === 'CREATED' ? 'Created' : 'Cancelled'}
    </span>
  )
}
