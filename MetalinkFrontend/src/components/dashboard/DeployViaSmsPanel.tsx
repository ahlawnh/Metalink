import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

type DeployStatus = 'idle' | 'transmitting' | 'success'

interface DeployViaSmsPanelProps {
  className?: string
}

export default function DeployViaSmsPanel({ className }: DeployViaSmsPanelProps) {
  const [status, setStatus] = useState<DeployStatus>('idle')
  const timeoutRef = useRef<number | null>(null)

  const isIdle = status === 'idle'

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  const schedule = (fn: () => void, delayMs: number) => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
    }
    timeoutRef.current = window.setTimeout(fn, delayMs)
  }

  const handleSend = () => {
    if (!isIdle) return

    setStatus('transmitting')
    schedule(() => {
      setStatus('success')
      schedule(() => {
        setStatus('idle')
      }, 1800)
    }, 1400)
  }

  const statusText =
    status === 'transmitting'
      ? 'Transmitting secure SMS...'
      : status === 'success'
        ? 'Deployment link sent'
        : 'Ready for dispatcher-triggered deployment'

  return (
    <section
      className={cn(
        'dash-card relative shrink-0 overflow-hidden p-3',
        'before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-cyan-300/35 before:to-transparent',
        className,
      )}
      aria-label="Deploy via SMS"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="dash-label tracking-[0.14em]">Deploy via SMS</p>
          <p className="mt-1 text-sm font-semibold text-[var(--dash-text-primary)]">Send caller access link</p>
        </div>
        <span
          className={cn(
            'rounded-full border px-2 py-1 font-data text-[10px] font-semibold uppercase tracking-[0.14em]',
            status === 'success'
              ? 'border-cyan-300/25 bg-[color-mix(in_srgb,#00E5FF_10%,transparent)] text-cyan-100'
              : 'border-white/[0.07] bg-white/[0.025] text-[var(--dash-text-secondary)]',
          )}
          aria-live="polite"
        >
          {status === 'transmitting' ? 'tx' : status}
        </span>
      </div>

      <button
        type="button"
        onClick={handleSend}
        disabled={!isIdle}
        aria-busy={status === 'transmitting'}
        className="group relative w-full overflow-hidden rounded-lg border border-cyan-300/20 bg-white/[0.04] px-3 py-3 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_12px_32px_rgba(0,229,255,0.07)] transition-all before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-cyan-200/60 before:to-transparent hover:border-cyan-200/45 hover:bg-white/[0.065] hover:text-white disabled:cursor-not-allowed disabled:border-white/[0.07] disabled:text-[var(--dash-text-secondary)] disabled:opacity-60"
      >
        {status === 'transmitting' ? 'Transmitting...' : status === 'success' ? 'Sent' : 'Send deployment link'}
      </button>

      <p
        className={cn(
          'mt-3 font-data text-[10px] font-semibold uppercase tracking-[0.12em]',
          status === 'success' ? 'text-cyan-100/80' : 'text-[var(--dash-text-secondary)]',
        )}
        aria-live="polite"
      >
        {statusText}
      </p>
    </section>
  )
}
