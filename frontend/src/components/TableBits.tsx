export function SkeletonRows({ columns, rows = 5 }: { columns: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={rowIndex} className="skeleton-row">
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <td key={columnIndex}>
              <span
                className="skeleton"
                style={{ width: columnIndex === 0 ? '55%' : columnIndex === columns - 1 ? '45%' : '80%' }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

interface PaginationProps {
  page: number
  limit: number
  total: number
  onChange: (page: number) => void
}

export function Pagination({ page, limit, total, onChange }: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / limit))
  const from = total === 0 ? 0 : (page - 1) * limit + 1
  const to = Math.min(page * limit, total)

  return (
    <div className="pagination">
      <span className="pagination-info">
        {total === 0 ? 'No results' : `${from}–${to} of ${total}`}
      </span>
      <div className="pagination-controls">
        <button
          type="button"
          className="button button-ghost button-sm"
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
        >
          Previous
        </button>
        <span className="pagination-page">
          Page {page} / {pageCount}
        </span>
        <button
          type="button"
          className="button button-ghost button-sm"
          onClick={() => onChange(page + 1)}
          disabled={page >= pageCount}
        >
          Next
        </button>
      </div>
    </div>
  )
}
