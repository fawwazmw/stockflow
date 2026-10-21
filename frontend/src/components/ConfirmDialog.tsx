import type { ReactNode } from 'react'
import { Alert } from './Feedback'
import { Modal } from './Modal'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel: string
  busyLabel?: string
  busy?: boolean
  danger?: boolean
  error?: string | null
  onCancel: () => void
  onConfirm: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  busyLabel = 'Working…',
  busy = false,
  danger = false,
  error = null,
  onCancel,
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={busy ? () => undefined : onCancel}
      footer={
        <>
          <button type="button" className="button button-ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className={danger ? 'button button-danger' : 'button button-primary'}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </>
      }
    >
      <div className="confirm-message">{message}</div>
      {error ? (
        <Alert tone="error" title="Action failed">
          {error}
        </Alert>
      ) : null}
    </Modal>
  )
}
