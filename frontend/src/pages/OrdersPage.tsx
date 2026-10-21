import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listOrders } from '../api/client'
import type { OrderStatusFilter } from '../api/types'
import { OrderStatusBadge } from '../components/Badges'
import { EmptyState, ErrorState } from '../components/Feedback'
import { Pagination, SkeletonRows } from '../components/TableBits'
import { useApi } from '../hooks/useApi'
import { useDebounce } from '../hooks/useDebounce'
import { formatDateTime, formatIDR } from '../lib/format'

const PAGE_SIZE = 10

const FILTERS: { value: OrderStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'created', label: 'Created' },
  { value: 'cancelled', label: 'Cancelled' },
]

export function OrdersPage() {
  const [searchInput, setSearchInput] = useState('')
  const search = useDebounce(searchInput, 300)
  const [status, setStatus] = useState<OrderStatusFilter>('all')
  const [page, setPage] = useState(1)

  const orders = useApi(
    () => listOrders({ search, status, page, limit: PAGE_SIZE }),
    [search, status, page],
  )

  useEffect(() => {
    setPage(1)
  }, [search, status])

  const filtersActive = search.trim() !== '' || status !== 'all'

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
        <div className="toolbar">
          <div className="search-box">
            <input
              className="input search-input"
              placeholder="Search customer"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              aria-label="Search orders"
            />
            {searchInput ? (
              <button
                type="button"
                className="search-clear"
                onClick={() => setSearchInput('')}
                aria-label="Clear search"
              >
                ×
              </button>
            ) : null}
          </div>

          <div className="tabs" role="tablist" aria-label="Filter orders">
            {FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                role="tab"
                aria-selected={status === filter.value}
                className={status === filter.value ? 'tab active' : 'tab'}
                onClick={() => setStatus(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {orders.error && !orders.data ? (
          <ErrorState message={orders.error.message} onRetry={orders.refetch} />
        ) : (
          <>
            {orders.error ? (
              <p className="muted">Showing the last loaded data. {orders.error.message}</p>
            ) : null}

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
                          kicker={filtersActive ? 'Filtered' : 'Sales'}
                          title={filtersActive ? 'No orders match' : 'No orders yet'}
                          message={
                            filtersActive
                              ? 'Try another customer name, or clear the filters to see every order.'
                              : 'Create an order to reserve stock and see the total the server calculates.'
                          }
                          action={
                            filtersActive ? (
                              <button
                                type="button"
                                className="button"
                                onClick={() => {
                                  setSearchInput('')
                                  setStatus('all')
                                }}
                              >
                                Clear filters
                              </button>
                            ) : (
                              <Link className="button button-primary" to="/orders/new">
                                Create order
                              </Link>
                            )
                          }
                        />
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {orders.data ? (
              <Pagination
                page={orders.data.page}
                limit={orders.data.limit}
                total={orders.data.total}
                onChange={setPage}
              />
            ) : null}
          </>
        )}
      </section>
    </div>
  )
}
