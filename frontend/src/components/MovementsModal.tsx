import { listMovements } from '../api/client'
import type { Product } from '../api/types'
import { useApi } from '../hooks/useApi'
import { formatDateTime } from '../lib/format'
import { EmptyState, ErrorState } from './Feedback'
import { Modal } from './Modal'
import { SkeletonRows } from './TableBits'

interface MovementsModalProps {
  product: Product | null
  onClose: () => void
}

export function MovementsModal({ product, onClose }: MovementsModalProps) {
  const movements = useApi(
    () => (product ? listMovements(product.id) : Promise.resolve([])),
    [product?.id],
  )

  if (!product) return null

  return (
    <Modal open title={`Stock history — ${product.sku}`} onClose={onClose} wide>
      <p className="modal-subtitle">{product.name}</p>

      {movements.error ? (
        <ErrorState message={movements.error.message} onRetry={movements.refetch} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>When</th>
                <th>Type</th>
                <th className="align-right">Qty</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {movements.loading && !movements.data ? <SkeletonRows columns={4} rows={4} /> : null}
              {movements.data?.map((movement) => (
                <tr key={movement.id}>
                  <td className="muted">{formatDateTime(movement.created_at)}</td>
                  <td>
                    <span className={movement.type === 'in' ? 'badge badge-green' : 'badge badge-amber'}>
                      {movement.type === 'in' ? 'Stock in' : 'Stock out'}
                    </span>
                  </td>
                  <td className="align-right">
                    {movement.type === 'in' ? '+' : '−'}
                    {movement.qty}
                  </td>
                  <td className="muted">{movement.note ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {movements.data && movements.data.length === 0 ? (
            <EmptyState
              title="No movements yet"
              message="Stock changes for this product will appear here."
            />
          ) : null}
        </div>
      )}
    </Modal>
  )
}
