/** Pure formatting helpers — unit tested in format.test.ts. */

const idr = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 })

/** IDR with no decimals: 12499000 -> "Rp 12.499.000". */
export function formatIDR(value: number): string {
  if (!Number.isFinite(value)) return 'Rp 0'
  return `Rp ${idr.format(Math.round(value))}`
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0'
  return idr.format(value)
}

const monthShort = new Intl.DateTimeFormat('en-US', { month: 'short' })

const pad2 = (value: number): string => String(value).padStart(2, '0')

/** "12 Sep 2026" — built explicitly so every month is three letters. */
export function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return `${pad2(date.getDate())} ${monthShort.format(date)} ${date.getFullYear()}`
}

/** "12 Sep 2026, 15:04" in the viewer's timezone. */
export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  return `${formatDate(iso)}, ${pad2(date.getHours())}:${pad2(date.getMinutes())}`
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * "2h ago" style relative time. `now` is injectable so the tests are stable.
 */
export function relativeTime(iso: string | null, now: number = Date.now()): string {
  if (!iso) return '—'
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'

  const diff = now - then
  if (diff < 0) return 'just now'
  if (diff < MINUTE) return 'just now'
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`
  if (diff < 30 * DAY) return `${Math.floor(diff / DAY)}d ago`
  return formatDate(iso)
}

/** Today's date in the browser's timezone as YYYY-MM-DD. */
export function todayISO(now: Date = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
