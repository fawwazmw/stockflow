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
  title: string
  message: string
  action?: ReactNode
}

export function EmptyState({ title, message, action }: EmptyStateProps) {
  return (
    <div className="state-block">
      <div className="state-icon">□</div>
      <h3>{title}</h3>
      <p>{message}</p>
      {action}
    </div>
  )
}

interface ErrorStateProps {
  message: string
  onRetry: () => void
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div className="state-block state-error">
      <div className="state-icon">!</div>
      <h3>Could not load data</h3>
      <p>{message}</p>
      <button type="button" className="button" onClick={onRetry}>
        Retry
      </button>
    </div>
  )
}
