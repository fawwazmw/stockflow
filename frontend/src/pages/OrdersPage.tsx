import { useState } from 'react'
import { Link } from 'react-router-dom'
import { listOrders } from '../api/client'
import { OrderStatusBadge } from '../components/Badges'
import { EmptyState, ErrorState } from '../components/Feedback'
import { Pagination, SkeletonRows } from '../components/TableBits'
import { useApi } from '../hooks/useApi'
import { formatDateTime, formatIDR } from '../lib/format'

const PAGE_SIZE = 10

export function OrdersPage() {
  const [page, setPage] = useState(1)
  const orders = useApi(() => listOrders(page, PAGE_SIZE), [page])

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Orders</h1>
          <p className="page-subtitle">
            Every sale, the stock it reserved, and whether it was cancelled.
          </p>
        </div>
        <div className="page-actions">
          <Link className="button button-primary" to="/orders/new">
            Create order
          </Link>
        </div>
      </div>

      <section className="card">
        {orders.error && !orders.data ? (
          <ErrorState message={orders.error.message} onRetry={orders.refetch} />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Created</th>
                  <th className="align-right">Items</th>
                  <th className="align-right">Total</th>
                  <th>Status</th>
                  <th className="align-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.loading && !orders.data ? <SkeletonRows columns={7} rows={5} /> : null}

                {orders.data?.data.map((order) => (
                  <tr key={order.id}>
                    <td className="cell-id" data-label="Order">
                      <Link className="link tabular" to={`/orders/${order.id}`}>
                        #{order.id}
                      </Link>
                    </td>
                    <td className="cell-customer" data-label="Customer">
                      {order.customer}
                    </td>
                    <td className="muted" data-label="Created">
                      {formatDateTime(order.created_at)}
                    </td>
                    <td className="num" data-label="Items">
                      {order.items.length}
                    </td>
                    <td className="num" data-label="Total">
                      {formatIDR(order.total)}
                    </td>
                    <td data-label="Status">
                      <OrderStatusBadge status={order.status} />
                    </td>
                    <td className="cell-actions" data-label="Actions">
                      <div className="row-actions">
                        <Link className="button button-sm button-ghost" to={`/orders/${order.id}`}>
                          View
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}

                {orders.data && orders.data.data.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="cell-empty">
                      <EmptyState
                        kicker="Sales"
                        title="No orders yet"
                        message="Create an order to reserve stock and see the total the server calculates."
                        action={
                          <Link className="button button-primary" to="/orders/new">
                            Create order
                          </Link>
                        }
                      />
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}

        {orders.data ? (
          <Pagination
            page={orders.data.page}
            limit={orders.data.limit}
            total={orders.data.total}
            onChange={setPage}
          />
        ) : null}
      </section>
    </div>
  )
}
