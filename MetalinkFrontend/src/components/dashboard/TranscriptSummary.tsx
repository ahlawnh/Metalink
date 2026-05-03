import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNow } from '@/hooks/useNow'
import { cn } from '@/lib/utils'
import type { TranscriptChunk } from '@/types/dashboard'

const SUMMARY_TIMEOUT_MS = 45_000
const TRANSCRIPT_AUTO_SCROLL_THRESHOLD_PX = 96

function formatSpeaker(role: TranscriptChunk['speaker']): string {
  switch (role) {
    case 'dispatcher':
      return 'Dispatcher'
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
  const ordered = useMemo(() => {
    return [...chunks].sort((a, b) => {
      const ta = Date.parse(a.timestamp)
      const tb = Date.parse(b.timestamp)
      const da = Number.isFinite(ta) ? ta : 0
      const db = Number.isFinite(tb) ? tb : 0
      if (da !== db) return da - db
      return a.id.localeCompare(b.id)
    })
  }, [chunks])
  const liveTime = now.toLocaleTimeString()

  const [isSummaryRequested, setIsSummaryRequested] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [summaryText, setSummaryText] = useState<string | null>(null)
  const [errorText, setErrorText] = useState<string | null>(null)

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  /** Only scroll the transcript panel when user is already near the bottom (see updateAutoScrollIntent). Starts false so the page does not jump on load. */
  const shouldAutoScrollRef = useRef(false)
  const prevLastTranscriptIdRef = useRef<string>('')
  const [showJumpToLatest, setShowJumpToLatest] = useState(false)
  const lastTranscriptId = ordered.at(-1)?.id ?? ''

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

  const updateAutoScrollIntent = useCallback(() => {
    const container = containerRef.current
    if (!container) return

    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    shouldAutoScrollRef.current = distanceFromBottom <= TRANSCRIPT_AUTO_SCROLL_THRESHOLD_PX
  }, [])

  const scrollTranscriptContainerToBottom = useCallback(() => {
    const el = containerRef.current
    if (!el) return
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight - el.clientHeight
    })
  }, [])

  const onJumpToLatest = useCallback(() => {
    shouldAutoScrollRef.current = true
    scrollTranscriptContainerToBottom()
    setShowJumpToLatest(false)
  }, [scrollTranscriptContainerToBottom])

  useEffect(() => {
    const el = containerRef.current
    if (ordered.length === 0) {
      prevLastTranscriptIdRef.current = ''
      setShowJumpToLatest(false)
      return
    }

    const currentLastId = ordered.at(-1)?.id ?? ''
    const hadPrevious = prevLastTranscriptIdRef.current !== ''
    const isNewTail = hadPrevious && currentLastId !== prevLastTranscriptIdRef.current
    prevLastTranscriptIdRef.current = currentLastId

    if (shouldAutoScrollRef.current && el) {
      const raf = requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight - el.clientHeight
      })
      setShowJumpToLatest(false)
      return () => cancelAnimationFrame(raf)
    }

    if (isNewTail && !shouldAutoScrollRef.current) {
      setShowJumpToLatest(true)
    }

    return undefined
  }, [lastTranscriptId, ordered.length])

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

      <section
        className="dash-card flex max-h-[min(34rem,60svh)] min-h-0 flex-1 flex-col overflow-hidden"
        aria-label="911 phone call transcript"
      >
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
        <div className="shrink-0 border-b border-white/[0.06] px-4 py-2.5">
          <div className="rounded-lg bg-[color-mix(in_srgb,var(--dash-accent)_10%,var(--dash-surface-raised))] px-3 py-2 ring-1 ring-[color-mix(in_srgb,var(--dash-accent)_22%,transparent)]">
            <p className="dash-label text-[color-mix(in_srgb,var(--dash-accent)_70%,var(--dash-text-secondary))]">
              Telephony ingest
            </p>
            <p className="mt-1 text-sm font-medium leading-snug text-[var(--dash-text-primary)]">
              Raw lines below mirror dual-channel STT. Summaries use the backend ingest buffer — send{' '}
              <span className="font-data text-[11px]">request.summary</span> over the telemetry WebSocket (Generate or
              refresh above).
            </p>
          </div>
        </div>
        <div className="relative min-h-0 flex-1">
          {showJumpToLatest ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center px-4 pb-3 pt-8 [background:linear-gradient(to_top,var(--dash-bg)_40%,transparent)]">
              <button
                type="button"
                onClick={onJumpToLatest}
                className="pointer-events-auto rounded-full bg-[color-mix(in_srgb,var(--dash-accent)_22%,var(--dash-surface-raised))] px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--dash-text-primary)] ring-1 ring-[color-mix(in_srgb,var(--dash-accent)_40%,transparent)] shadow-lg transition hover:bg-[color-mix(in_srgb,var(--dash-accent)_32%,var(--dash-surface-raised))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
              >
                Jump to latest
              </button>
            </div>
          ) : null}
          <div
            ref={containerRef}
            onScroll={updateAutoScrollIntent}
            className="min-h-0 h-full max-h-full flex-1 overflow-y-auto overscroll-y-contain px-4 py-3"
          >
          {ordered.length === 0 ? (
            <p className="text-sm text-[var(--dash-text-secondary)]">No transcript lines yet.</p>
          ) : (
            <ul className="space-y-3">
              {ordered.map((line) => {
                const isDispatcher = line.speaker === 'dispatcher'
                const isAi = line.speaker === 'ai'

                return (
                  <li
                    key={line.id}
                    className={cn('flex', isDispatcher ? 'justify-end' : isAi ? 'justify-center' : 'justify-start')}
                  >
                    <article
                      className={cn(
                        'max-w-[82%] rounded-2xl px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ring-1',
                        isDispatcher
                          ? 'rounded-br-sm bg-[color-mix(in_srgb,#00E5FF_18%,var(--dash-surface-raised))] text-[#B2EBF2] ring-[color-mix(in_srgb,#00E5FF_28%,transparent)]'
                          : isAi
                            ? 'rounded-bl-sm rounded-br-sm bg-[color-mix(in_srgb,var(--dash-accent)_14%,var(--dash-surface-raised))] text-[var(--dash-text-primary)] ring-[color-mix(in_srgb,var(--dash-accent)_24%,transparent)]'
                            : 'rounded-bl-sm bg-[var(--dash-surface-raised)] text-[#E0E0E0] ring-white/[0.05]',
                      )}
                    >
                      <p
                        className={cn(
                          'flex flex-wrap items-baseline gap-x-2 gap-y-0',
                          isDispatcher && 'justify-end text-right',
                        )}
                      >
                        <span
                          className={cn(
                            'dash-label rounded-full px-2 py-0.5 ring-1',
                            isDispatcher
                              ? 'bg-[color-mix(in_srgb,#00E5FF_12%,transparent)] text-[#80DEEA] ring-[color-mix(in_srgb,#00E5FF_26%,transparent)]'
                              : isAi
                                ? 'bg-[color-mix(in_srgb,var(--dash-accent)_12%,transparent)] text-[color-mix(in_srgb,var(--dash-accent)_76%,var(--dash-text-secondary))] ring-[color-mix(in_srgb,var(--dash-accent)_22%,transparent)]'
                                : 'bg-white/[0.04] text-[var(--dash-text-secondary)] ring-white/[0.06]',
                          )}
                        >
                          {formatSpeaker(line.speaker)}
                        </span>
                        <span className="font-data text-[11px] font-semibold normal-case tracking-normal text-current opacity-70">
                          {new Date(line.timestamp).toLocaleTimeString()}
                        </span>
                      </p>
                      <p
                        className={cn(
                          'mt-1 text-sm font-medium leading-relaxed',
                          isDispatcher && 'text-right',
                        )}
                      >
                        {line.text}
                      </p>
                    </article>
                  </li>
                )
              })}
            </ul>
          )}
          </div>
        </div>
      </section>
    </div>
  )
}
