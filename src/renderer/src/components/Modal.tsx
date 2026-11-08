import { useEffect, useRef } from 'react'

interface ModalProps {
  /** id of the element that names the dialog. */
  labelledBy: string
  onClose(): void
  /** `dark`: the bottle-green photo preview. */
  tone?: 'light' | 'dark'
  className?: string
  /** Extra keys (the preview uses ← and →). Escape always closes. */
  onKeyDown?(event: React.KeyboardEvent<HTMLDivElement>): void
  children: React.ReactNode
}

const FOCUSABLE =
  'button:not(:disabled), [href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])'

/**
 * A modal dialog: focus moves in (to the element marked `data-autofocus`, else the first
 * control), Tab stays inside, Escape closes, and focus goes back where it was on close.
 */
export function Modal({
  labelledBy,
  onClose,
  tone = 'light',
  className,
  onKeyDown,
  children
}: ModalProps): React.JSX.Element {
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const el = box.current
    const first =
      el?.querySelector<HTMLElement>('[data-autofocus]') ??
      el?.querySelector<HTMLElement>(FOCUSABLE) ??
      el
    first?.focus()
    return () => previous?.focus?.()
  }, [])

  const keyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key === 'Tab' && box.current) {
      const items = [...box.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
      const first = items[0]
      const last = items.at(-1)
      if (first && last) {
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    onKeyDown?.(event)
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={box}
        className={`modal modal--${tone}${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        onKeyDown={keyDown}
      >
        {children}
      </div>
    </div>
  )
}
