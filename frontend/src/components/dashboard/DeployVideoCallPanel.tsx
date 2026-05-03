import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

type DeployStatus = 'idle' | 'transmitting' | 'success' | 'error'

interface DeployVideoCallPanelProps {
  className?: string
  /** Optional incident session UUID if known; backend defaults to latest telemetry session when omitted. */
  sessionId?: string
}

function buildVideoDeployPostUrl(sessionId?: string): string | null {
  try {
    const origin =
      (import.meta.env.VITE_TELEMETRY_API_ORIGIN as string | undefined)?.trim() || 'http://127.0.0.1:8000'
    const u = new URL(origin)
    u.pathname = '/api/incident/video-deploy'
    if (sessionId && sessionId.trim().length >= 8) {
      u.searchParams.set('session_id', sessionId.trim())
    }
    return u.toString()
  } catch {
    return null
  }
}

export default function DeployVideoCallPanel({ className, sessionId }: DeployVideoCallPanelProps) {
  const [status, setStatus] = useState<DeployStatus>('idle')
  const [errorDetail, setErrorDetail] = useState<string | null>(null)
  const timeoutRef = useRef<number | null>(null)

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

  const handleSend = async () => {
    if (status === 'transmitting') return

    const url = buildVideoDeployPostUrl(sessionId)
    if (!url) {
      setErrorDetail('Bad telemetry API URL')
      setStatus('error')
      schedule(() => {
        setStatus('idle')
        setErrorDetail(null)
      }, 2800)
      return
    }

    setStatus('transmitting')
    setErrorDetail(null)

    try {
      const res = await fetch(url, { method: 'POST' })
      const raw = await res.text()
      let data: { detail?: string; video_deploy_seq?: number } = {}
      try {
        data = raw ? (JSON.parse(raw) as typeof data) : {}
      } catch {
        data = {}
      }
      if (!res.ok) {
        const detail =
          typeof data.detail === 'string' ? data.detail : raw || `HTTP ${res.status}`
        throw new Error(detail)
      }
      setStatus('success')
      schedule(() => {
        setStatus('idle')
      }, 2000)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Deploy failed'
      setErrorDetail(msg)
      setStatus('error')
    }
  }

  const statusText =
    status === 'transmitting'
      ? 'Signaling caller device…'
      : status === 'success'
        ? 'Video prompt sent — caller may enable camera'
        : status === 'error'
          ? (errorDetail ?? 'Deploy failed')
          : 'Prompt the caller’s phone to enable FaceTime-style video and vitals'

  return (
    <section
      className={cn(
        'dash-card relative shrink-0 overflow-hidden p-3',
        'before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-cyan-300/35 before:to-transparent',
        className,
      )}
      aria-label="Deploy video call"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="dash-label tracking-[0.14em]">Deploy video call</p>
          <p className="mt-1 text-sm font-semibold text-[var(--dash-text-primary)]">Cue camera & vitals on scene</p>
        </div>
        <span
          className={cn(
            'rounded-full border px-2 py-1 font-data text-[10px] font-semibold uppercase tracking-[0.14em]',
            status === 'success'
              ? 'border-cyan-300/25 bg-[color-mix(in_srgb,#00E5FF_10%,transparent)] text-cyan-100'
              : status === 'error'
                ? 'border-red-400/35 bg-red-950/30 text-red-100'
                : 'border-white/[0.07] bg-white/[0.025] text-[var(--dash-text-secondary)]',
          )}
          aria-live="polite"
        >
          {status === 'transmitting' ? 'tx' : status === 'error' ? 'err' : status}
        </span>
      </div>

      <button
        type="button"
        onClick={() => void handleSend()}
        disabled={status === 'transmitting' || status === 'success'}
        aria-busy={status === 'transmitting'}
        className="group relative w-full overflow-hidden rounded-lg border border-cyan-300/20 bg-white/[0.04] px-3 py-3 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),0_12px_32px_rgba(0,229,255,0.07)] transition-all before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-cyan-200/60 before:to-transparent hover:border-cyan-200/45 hover:bg-white/[0.065] hover:text-white disabled:cursor-not-allowed disabled:border-white/[0.07] disabled:text-[var(--dash-text-secondary)] disabled:opacity-60"
      >
        {status === 'transmitting'
          ? 'Sending…'
          : status === 'success'
            ? 'Sent'
            : status === 'error'
              ? 'Retry deploy'
              : 'Send deployment'}
      </button>

      <p
        className={cn(
          'mt-3 font-data text-[10px] font-semibold uppercase tracking-[0.12em]',
          status === 'success'
            ? 'text-cyan-100/80'
            : status === 'error'
              ? 'text-red-200/90'
              : 'text-[var(--dash-text-secondary)]',
        )}
        aria-live="polite"
      >
        {statusText}
      </p>
    </section>
  )
}
