import type { ReactNode } from 'react'

type Tone = 'error' | 'warning' | 'success' | 'info'

interface AlertProps {
  tone?: Tone
  title?: string
  children: ReactNode
}

export function Alert({ tone = 'error', title, children }: AlertProps) {
  return (
    <div className={`alert alert-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {title ? <strong className="alert-title">{title}</strong> : null}
      <div>{children}</div>
    </div>
  )
}

interface EmptyStateProps {
  kicker?: string
  title: string
  message: string
  action?: ReactNode
}

/** No icon: a ruled blank in a ledger is a label and a line, not a glyph. */
export function EmptyState({ kicker = 'Empty', title, message, action }: EmptyStateProps) {
  return (
    <div className="state-block">
      <span className="state-kicker">{kicker}</span>
      <h3>{title}</h3>
      <p>{message}</p>
      {action}
    </div>
  )
}

interface ErrorStateProps {
  title?: string
  message: string
  onRetry: () => void
}

export function ErrorState({ title = 'Could not load this data', message, onRetry }: ErrorStateProps) {
  return (
    <div className="state-block state-error">
      <span className="state-kicker">Connection error</span>
      <h3>{title}</h3>
      <p>{message}</p>
      <button type="button" className="button" onClick={onRetry}>
        Try again
      </button>
    </div>
  )
}
