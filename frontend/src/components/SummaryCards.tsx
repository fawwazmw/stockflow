import type { DailySales, Summary } from '../api/types'
import { formatIDR, formatNumber, plural } from '../lib/format'

interface SummaryCardsProps {
  summary: Summary | null
  daily: DailySales | null
  loading: boolean
}

interface CellProps {
  label: string
  value: string
  note?: string
  primary?: boolean
}

function Cell({ label, value, note, primary = false }: CellProps) {
  return (
    <div className={primary ? 'ledger-cell ledger-cell-primary' : 'ledger-cell'}>
      <span className="ledger-label">{label}</span>
      <span className="ledger-value">{value}</span>
      {note ? <span className="ledger-note">{note}</span> : null}
    </div>
  )
}

/**
 * One ruled panel rather than five floating cards. Stock value is the largest
 * figure because money is the first question a supervisor gets asked.
 */
export function SummaryCards({ summary, daily, loading }: SummaryCardsProps) {
  return (
    <section className="ledger-band" aria-label="Inventory summary" aria-busy={loading}>
      <Cell
        primary
        label="Stock value"
        value={summary ? formatIDR(summary.total_stock_value) : '-'}
        note="price × stock, all products"
      />
      <Cell label="Total products" value={summary ? formatNumber(summary.total_products) : '-'} />
      <Cell
        label="Active products"
        value={summary ? formatNumber(summary.active_products) : '-'}
      />
      <Cell
        label="Low stock"
        value={summary ? formatNumber(summary.low_stock_count) : '-'}
        note="10 units or fewer"
      />
      <Cell
        label="Today's sales"
        value={daily ? formatIDR(daily.revenue) : '-'}
        note={daily ? `${plural(daily.orders_count, 'order')}, ${plural(daily.items_sold, 'item')}` : undefined}
      />
    </section>
  )
}
