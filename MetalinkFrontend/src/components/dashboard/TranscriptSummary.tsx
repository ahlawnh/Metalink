import { useCallback, useEffect, useRef, useState } from 'react'
import { useNow } from '@/hooks/useNow'
import { cn } from '@/lib/utils'
import type { TranscriptChunk } from '@/types/dashboard'

const SUMMARY_TIMEOUT_MS = 45_000

function formatSpeaker(role: TranscriptChunk['speaker']): string {
  switch (role) {
    case 'dispatcher':
      return '911 operator'
    case 'caller':
      return 'Caller'
    case 'ai':
      return 'AI'
    default:
      return role
  }
}

interface TranscriptSummaryProps {
  chunks: TranscriptChunk[]
  /** Live telemetry WebSocket — backend summarizer reads server-side transcript buffer (`request.summary` → `telemetry.summary_updated`). */
  requestRollingSummary: () => void
  subscribeRollingSummary: (fn: (text: string) => void) => () => void
  wsConnected: boolean
}

function SummaryLoadingPanel() {
  return (
    <div
      className="min-h-[7.5rem] rounded-lg bg-[var(--dash-surface-raised)] p-4 ring-1 ring-white/[0.06]"
      aria-busy="true"
      aria-label="Generating AI summary"
    >
      <p className="mb-4 text-center text-xs font-medium tracking-wide text-[var(--dash-text-secondary)] motion-safe:animate-pulse">
        AI compiling summary…
      </p>
      <div className="space-y-3">
        <div className="h-3 w-2/5 rounded-md summary-shimmer-bg ring-1 ring-white/[0.04]" />
        <div className="h-3 w-full rounded-md summary-shimmer-bg ring-1 ring-white/[0.04]" />
        <div className="h-3 w-[92%] rounded-md summary-shimmer-bg ring-1 ring-white/[0.04]" />
        <div className="h-3 w-4/5 rounded-md summary-shimmer-bg ring-1 ring-white/[0.04]" />
      </div>
    </div>
  )
}

export default function TranscriptSummary({
  chunks,
  requestRollingSummary,
  subscribeRollingSummary,
  wsConnected,
}: TranscriptSummaryProps) {
  const now = useNow(1000)
  const ordered = [...chunks].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  const liveTime = now.toLocaleTimeString()

  const [isSummaryRequested, setIsSummaryRequested] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [summaryText, setSummaryText] = useState<string | null>(null)
  const [errorText, setErrorText] = useState<string | null>(null)

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearSummaryTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }, [])

  useEffect(() => {
    const unsub = subscribeRollingSummary((text) => {
      clearSummaryTimeout()
      setIsGenerating(false)
      setSummaryText(text.trim().length > 0 ? text : 'No summary text returned.')
      setErrorText(null)
    })
    return unsub
  }, [subscribeRollingSummary, clearSummaryTimeout])

  useEffect(() => {
    if (!isGenerating) {
      clearSummaryTimeout()
      return
    }
    timeoutRef.current = setTimeout(() => {
      setIsGenerating(false)
      setIsSummaryRequested(false)
      setErrorText('Summary request timed out. Ensure the telemetry WebSocket is connected and the backend summarizer is available.')
      timeoutRef.current = null
    }, SUMMARY_TIMEOUT_MS)
    return () => clearSummaryTimeout()
  }, [isGenerating, clearSummaryTimeout])

  const onGenerateClick = () => {
    if (!wsConnected || isGenerating) return
    setIsSummaryRequested(true)
    setIsGenerating(true)
    setErrorText(null)
    requestRollingSummary()
  }

  const onTryAgainAfterError = () => {
    setErrorText(null)
    setIsSummaryRequested(false)
  }

  const primaryLabel = summaryText ? 'Refresh transcript summary' : 'Generate AI Summary'

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="shrink-0">
        <button
          type="button"
          onClick={onGenerateClick}
          disabled={!wsConnected || isGenerating}
          title={wsConnected ? undefined : 'Connect to telemetry service to request a summary'}
          className="w-full rounded-lg bg-[color-mix(in_srgb,#18FFFF_16%,var(--dash-surface))] px-4 py-3 text-center text-sm font-semibold tracking-tight text-[#E0E0E0] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-[color-mix(in_srgb,#00E5FF_40%,transparent)] transition hover:bg-[color-mix(in_srgb,#18FFFF_24%,var(--dash-surface))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF] disabled:cursor-not-allowed disabled:opacity-45"
        >
          {isGenerating ? 'Working…' : primaryLabel}
        </button>
      </div>

      {isGenerating || summaryText !== null || errorText !== null ? (
        <section className="shrink-0" aria-live="polite" data-summary-requested={isSummaryRequested ? 'true' : 'false'}>
          {isGenerating && !summaryText ? <SummaryLoadingPanel /> : null}
          {!isGenerating && errorText ? (
            <div className="min-h-[7.5rem] rounded-lg border border-[color-mix(in_srgb,#FF525240%,transparent)] bg-[color-mix(in_srgb,#FF525212%,var(--dash-surface-raised))] p-4">
              <p className="text-sm leading-relaxed text-[#FFAB91]">{errorText}</p>
              <button
                type="button"
                onClick={onTryAgainAfterError}
                className="mt-4 rounded-md bg-[var(--dash-surface)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-[#E0E0E0] ring-1 ring-white/[0.1] hover:bg-[var(--dash-surface-raised)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
              >
                Try again
              </button>
            </div>
          ) : null}
          {summaryText !== null && !errorText ? (
            <div
              className={cn(
                'min-h-[7.5rem] rounded-lg bg-[var(--dash-surface-raised)] p-4 ring-1 ring-white/[0.06]',
                isGenerating && 'opacity-55',
              )}
            >
              {isGenerating ? (
                <p className="mb-3 text-center text-xs font-medium tracking-wide text-[var(--dash-text-secondary)] motion-safe:animate-pulse">
                  Refreshing summary from live transcript…
                </p>
              ) : null}
              <p className="dash-label mb-2">AI transcript summary</p>
              <p className="font-sans text-sm font-normal leading-relaxed tracking-normal text-[#E0E0E0]">{summaryText}</p>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="dash-card flex min-h-0 flex-1 flex-col" aria-label="911 phone call transcript">
        <header className="dash-header-strip shrink-0 border-b border-white/[0.06] px-4 py-3">
          <p className="dash-label">Call transcript</p>
          <p className="mt-1 text-sm font-semibold text-[var(--dash-text-primary)]">911 voice line · both sides</p>
          <p
            className="mt-1 font-data text-[11px] font-medium tabular-nums text-[var(--dash-text-secondary)]"
            aria-live="polite"
          >
            Local time <span className="text-[var(--dash-text-primary)]">{liveTime}</span>
          </p>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mb-4 rounded-lg bg-[color-mix(in_srgb,var(--dash-accent)_10%,var(--dash-surface-raised))] px-3 py-2 ring-1 ring-[color-mix(in_srgb,var(--dash-accent)_22%,transparent)]">
            <p className="dash-label text-[color-mix(in_srgb,var(--dash-accent)_70%,var(--dash-text-secondary))]">
              Telephony ingest
            </p>
            <p className="mt-1 text-sm font-medium leading-snug text-[var(--dash-text-primary)]">
              Raw lines below mirror dual-channel STT. Summaries use the backend ingest buffer — send{' '}
              <span className="font-data text-[11px]">request.summary</span> over the telemetry WebSocket (Generate or
              refresh summary above).
            </p>
          </div>
          {ordered.length === 0 ? (
            <p className="text-sm text-[var(--dash-text-secondary)]">No transcript lines yet.</p>
          ) : (
            <ul className="space-y-3">
              {ordered.map((line) => (
                <li key={line.id} className="dash-inset px-3 py-2">
                  <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
                    <span className="dash-label">{formatSpeaker(line.speaker)}</span>
                    <span className="font-data text-[11px] font-semibold normal-case tracking-normal text-[var(--dash-text-primary)]">
                      · {new Date(line.timestamp).toLocaleTimeString()}
                    </span>
                  </p>
                  <p className="mt-1 text-sm font-medium leading-relaxed text-[var(--dash-text-primary)]">{line.text}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
