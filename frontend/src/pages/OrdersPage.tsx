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
          <p className="page-subtitle">Every sale, its status and the stock it consumed.</p>
        </div>
        <div className="page-actions">
          <Link className="button button-ghost" to="/">
            Products
          </Link>
          <Link className="button button-primary" to="/orders/new">
            New order
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
                  <th />
                </tr>
              </thead>
              <tbody>
                {orders.loading && !orders.data ? <SkeletonRows columns={7} rows={5} /> : null}

                {orders.data?.data.map((order) => (
                  <tr key={order.id}>
                    <td>
                      <Link className="link" to={`/orders/${order.id}`}>
                        #{order.id}
                      </Link>
                    </td>
                    <td>{order.customer}</td>
                    <td className="muted">{formatDateTime(order.created_at)}</td>
                    <td className="align-right">{order.items.length}</td>
                    <td className="align-right tabular">{formatIDR(order.total)}</td>
                    <td>
                      <OrderStatusBadge status={order.status} />
                    </td>
                    <td className="align-right">
                      <Link className="button button-sm button-ghost" to={`/orders/${order.id}`}>
                        View
                      </Link>
                    </td>
                  </tr>
                ))}

                {orders.data && orders.data.data.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <EmptyState
                        title="No orders yet"
                        message="Create an order to reserve stock and see the server-computed total."
                        action={
                          <Link className="button button-primary" to="/orders/new">
                            New order
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
