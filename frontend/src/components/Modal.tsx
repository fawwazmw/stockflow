import { useEffect, useRef, type ReactNode } from 'react'

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function Modal({ open, title, onClose, children, footer, wide = false }: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const returnFocusTo = useRef<HTMLElement | null>(null)
  const wasOpen = useRef(false)

  // Capture the trigger during render, before the dialog's autoFocus can move
  // focus. Doing this in an effect is too late: activeElement is already inside
  // the dialog by then.
  if (open && !wasOpen.current) {
    returnFocusTo.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
  }
  wasOpen.current = open

  // Parents pass a fresh onClose on every render. Holding it in a ref keeps the
  // effect tied to `open` only, so typing in a field never re-runs the focus
  // setup and steals the caret.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const restoreFocus = () => {
      const target = returnFocusTo.current
      // Deferred so React's StrictMode double-invoke (cleanup then setup on
      // mount) does not yank focus back to the page while the dialog is open.
      queueMicrotask(() => {
        if (!target || !document.contains(target)) return
        if (document.querySelector('[role="dialog"]')) return
        target.focus()
      })
    }

    if (!open) {
      restoreFocus()
      return
    }

    const dialog = dialogRef.current
    const focusableItems = () =>
      Array.from(dialog?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? [])

    // Respect an autoFocus inside the dialog instead of forcing the first
    // control (usually the close button) to take focus.
    if (dialog && !dialog.contains(document.activeElement)) {
      const first = focusableItems()[0]
      if (first) first.focus()
      else dialog.focus()
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const items = focusableItems()
      if (items.length === 0) {
        event.preventDefault()
        return
      }

      const first = items[0]
      const last = items[items.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      restoreFocus()
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        className={wide ? 'modal modal-wide' : 'modal'}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <header className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-footer">{footer}</footer> : null}
      </div>
    </div>
  )
}
