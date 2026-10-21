import type { DailySales, Summary } from '../api/types'
import { formatIDR, formatNumber } from '../lib/format'

interface SummaryCardsProps {
  summary: Summary | null
  daily: DailySales | null
  loading: boolean
}

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card metric">
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
      {hint ? <span className="metric-hint">{hint}</span> : null}
    </div>
  )
}

export function SummaryCards({ summary, daily, loading }: SummaryCardsProps) {
  const placeholder = '—'

  return (
    <section className="metrics" aria-label="Inventory summary" aria-busy={loading}>
      <Card
        label="Total products"
        value={summary ? formatNumber(summary.total_products) : placeholder}
      />
      <Card
        label="Active products"
        value={summary ? formatNumber(summary.active_products) : placeholder}
      />
      <Card
        label="Stock value"
        value={summary ? formatIDR(summary.total_stock_value) : placeholder}
        hint="price × stock"
      />
      <Card
        label="Low stock"
        value={summary ? formatNumber(summary.low_stock_count) : placeholder}
        hint="≤ 10 units"
      />
      <Card
        label="Today's sales"
        value={daily ? formatIDR(daily.revenue) : placeholder}
        hint={daily ? `${daily.orders_count} orders · ${daily.items_sold} items` : undefined}
      />
    </section>
  )
}
