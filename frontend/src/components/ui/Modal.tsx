import { createPortal } from 'react-dom'
import { useEffect, useRef, type ReactNode } from 'react'

export interface ModalProps {
  open: boolean
  title: string
  description?: string
  children?: ReactNode
  /** Called when backdrop is clicked — keep modal open if handler calls preventDefault-like pattern via returning false — here we always close on backdrop */
  onClose: () => void
  primaryAction?: { label: string; onClick: () => void }
  secondaryAction?: { label: string; onClick: () => void }
}

export function Modal({
  open,
  title,
  description,
  children,
  onClose,
  primaryAction,
  secondaryAction,
}: ModalProps) {
  const secondaryRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (open) {
      secondaryRef.current?.focus()
    }
  }, [open])

  if (!open) return null

  const secondaryLabel = secondaryAction?.label ?? 'Cancel'

  return createPortal(
    <div className="fixed inset-0 z-[850] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/65 backdrop-blur-[2px]"
        aria-label="Dismiss dialog"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="relative z-10 w-full max-w-lg rounded-xl bg-[var(--dash-surface)] p-5 shadow-[0_24px_80px_rgba(0,0,0,0.65)] ring-1 ring-white/[0.08]"
      >
        <h2 id="modal-title" className="text-lg font-bold tracking-tight text-[var(--dash-text-primary)]">
          {title}
        </h2>
        {description ? (
          <p className="mt-2 text-sm leading-relaxed text-[var(--dash-text-secondary)]">{description}</p>
        ) : null}
        {children ? <div className="mt-4">{children}</div> : null}

        <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-white/[0.06] pt-4">
          <button
            ref={secondaryRef}
            type="button"
            className="rounded-md bg-[var(--dash-surface-raised)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--dash-text-primary)] ring-1 ring-white/[0.1] hover:bg-[color-mix(in_srgb,var(--dash-surface-raised)_88%,#fff)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
            onClick={() => secondaryAction?.onClick?.() ?? onClose()}
          >
            {secondaryLabel}
          </button>
          {primaryAction ? (
            <button
              type="button"
              className="rounded-md bg-[color-mix(in_srgb,#18FFFF_18%,var(--dash-surface-raised))] px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#80FFFF] ring-1 ring-[color-mix(in_srgb,#00E5FF_45%,transparent)] hover:bg-[color-mix(in_srgb,#18FFFF_26%,var(--dash-surface-raised))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
              onClick={primaryAction.onClick}
            >
              {primaryAction.label}
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  )
}
