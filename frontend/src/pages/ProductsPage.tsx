import { useEffect, useState } from 'react'
import { ApiError, deleteProduct, getDailySales, getSummary, listProducts } from '../api/client'
import type { Product, ProductStatusFilter } from '../api/types'
import { ProductStatusBadge, StockCell } from '../components/Badges'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Alert, EmptyState, ErrorState } from '../components/Feedback'
import { MovementsModal } from '../components/MovementsModal'
import { ProductFormModal } from '../components/ProductFormModal'
import { StockAdjustModal } from '../components/StockAdjustModal'
import { SummaryCards } from '../components/SummaryCards'
import { Pagination, SkeletonRows } from '../components/TableBits'
import { useApi } from '../hooks/useApi'
import { useDebounce } from '../hooks/useDebounce'
import { formatIDR, relativeTime, todayISO } from '../lib/format'

const PAGE_SIZE = 10

const FILTERS: { value: ProductStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'low', label: 'Low stock' },
]

export function ProductsPage() {
  const [searchInput, setSearchInput] = useState('')
  const search = useDebounce(searchInput, 300)
  const [status, setStatus] = useState<ProductStatusFilter>('all')
  const [page, setPage] = useState(1)
  const [refreshKey, setRefreshKey] = useState(0)

  const [formOpen, setFormOpen] = useState(false)
  const [formProduct, setFormProduct] = useState<Product | null>(null)
  const [adjustTarget, setAdjustTarget] = useState<Product | null>(null)
  const [historyTarget, setHistoryTarget] = useState<Product | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  const products = useApi(
    () => listProducts({ search, status, page, limit: PAGE_SIZE }),
    [search, status, page, refreshKey],
  )
  const summary = useApi(() => getSummary(), [refreshKey])
  const daily = useApi(() => getDailySales(todayISO()), [refreshKey])

  useEffect(() => {
    setPage(1)
  }, [search, status])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 4000)
    return () => window.clearTimeout(timer)
  }, [toast])

  const refresh = () => setRefreshKey((key) => key + 1)

  const retryAll = () => {
    products.refetch()
    summary.refetch()
    daily.refetch()
  }

  const openAdd = () => {
    setFormProduct(null)
    setFormOpen(true)
  }

  const openEdit = (product: Product) => {
    setFormProduct(product)
    setFormOpen(true)
  }

  const handleSaved = (message: string) => {
    setFormOpen(false)
    setAdjustTarget(null)
    setToast(message)
    refresh()
  }

  const requestDelete = (product: Product) => {
    setFormOpen(false)
    setDeleteError(null)
    setDeleteTarget(product)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteProduct(deleteTarget.id)
      setToast(`${deleteTarget.sku} deleted`)
      setDeleteTarget(null)
      refresh()
    } catch (error) {
      if (error instanceof ApiError && error.isProductHasHistory) {
        setDeleteError(
          'This product has stock movements or order history, so it cannot be deleted. Deactivate it instead to keep the records intact.',
        )
      } else {
        setDeleteError(error instanceof ApiError ? error.message : 'The product could not be deleted.')
      }
    } finally {
      setDeleting(false)
    }
  }

  const filtersActive = search.trim() !== '' || status !== 'all'
  const rows = products.data?.data ?? []
  const showSkeleton = products.loading && products.data === null

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Products</h1>
          <p className="page-subtitle">
            Every item in the warehouse, with its stock on hand, price and last movement.
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="button button-primary" onClick={openAdd}>
            Add product
          </button>
        </div>
      </div>

      <SummaryCards summary={summary.data} daily={daily.data} loading={summary.loading} />

      <section className="card">
        <div className="toolbar">
          <div className="search-box">
            <input
              className="input search-input"
              placeholder="Search SKU or product name"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              aria-label="Search products"
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

          <div className="tabs" role="tablist" aria-label="Filter products">
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
                {filter.value === 'low' ? <span className="tab-hint">≤ 10</span> : null}
              </button>
            ))}
          </div>
        </div>

        {toast ? <Alert tone="success">{toast}</Alert> : null}

        {products.error && !products.data ? (
          <ErrorState message={products.error.message} onRetry={retryAll} />
        ) : (
          <>
            {products.error ? (
              <Alert tone="warning" title="Showing the last loaded data">
                {products.error.message}
              </Alert>
            ) : null}

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Name</th>
                    <th className="align-right">Price</th>
                    <th className="align-right">Stock</th>
                    <th>Status</th>
                    <th>Last movement</th>
                    <th className="align-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {showSkeleton ? <SkeletonRows columns={7} rows={6} /> : null}

                  {rows.map((product) => (
                    <tr key={product.id}>
                      <td className="cell-sku" data-label="SKU">
                        <code className="sku">{product.sku}</code>
                      </td>
                      <td className="cell-name product-name" data-label="Name">
                        {product.name}
                      </td>
                      <td className="num" data-label="Price">
                        {formatIDR(product.price)}
                      </td>
                      <td className="align-right" data-label="Stock">
                        <StockCell stock={product.stock} />
                      </td>
                      <td data-label="Status">
                        <ProductStatusBadge active={product.is_active} />
                      </td>
                      <td className="muted" data-label="Last movement">
                        {relativeTime(product.last_movement_at)}
                      </td>
                      <td className="cell-actions" data-label="Actions">
                        <div className="row-actions">
                          <button
                            type="button"
                            className="button button-sm"
                            onClick={() => setAdjustTarget(product)}
                          >
                            Adjust
                          </button>
                          <button
                            type="button"
                            className="button button-sm button-ghost"
                            onClick={() => setHistoryTarget(product)}
                          >
                            History
                          </button>
                          <button
                            type="button"
                            className="button button-sm button-ghost"
                            onClick={() => openEdit(product)}
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {!showSkeleton && rows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="cell-empty">
                        <EmptyState
                          kicker={filtersActive ? 'Filtered' : 'Catalogue'}
                          title={filtersActive ? 'No products match' : 'No products yet'}
                          message={
                            filtersActive
                              ? 'Try another search term, or clear the filters to see every item.'
                              : 'Add the first product to start keeping a stock ledger.'
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
                              <button type="button" className="button button-primary" onClick={openAdd}>
                                Add product
                              </button>
                            )
                          }
                        />
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {products.data ? (
              <Pagination
                page={products.data.page}
                limit={products.data.limit}
                total={products.data.total}
                onChange={setPage}
              />
            ) : null}
          </>
        )}
      </section>

      <ProductFormModal
        open={formOpen}
        product={formProduct}
        onClose={() => setFormOpen(false)}
        onSaved={(product) =>
          handleSaved(`${product.sku} ${formProduct ? 'updated' : 'added'}`)
        }
        onRequestDelete={requestDelete}
      />

      <StockAdjustModal
        product={adjustTarget}
        onClose={() => setAdjustTarget(null)}
        onSaved={(product) => handleSaved(`Stock for ${product.sku} is now ${product.stock}`)}
      />

      <MovementsModal product={historyTarget} onClose={() => setHistoryTarget(null)} />

      <ConfirmDialog
        open={deleteTarget !== null}
        title={`Delete ${deleteTarget?.sku ?? 'product'}?`}
        message={
          <>
            <p>
              This removes <strong>{deleteTarget?.name}</strong> from the catalogue. It cannot be
              undone.
            </p>
            <p className="muted">
              Products with stock movements or order history can never be deleted. Deactivate them
              instead.
            </p>
          </>
        }
        confirmLabel="Delete product"
        busyLabel="Deleting"
        busy={deleting}
        danger
        error={deleteError}
        onCancel={() => {
          setDeleteTarget(null)
          setDeleteError(null)
        }}
        onConfirm={handleDelete}
      />
    </div>
  )
}
