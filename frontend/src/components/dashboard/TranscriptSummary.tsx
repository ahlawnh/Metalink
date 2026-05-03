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
      className="relative min-h-[7.5rem] overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.02] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm"
      aria-busy="true"
      aria-label="Generating AI summary"
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/30 to-transparent" />
      <p className="mb-4 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--dash-text-secondary)] motion-safe:animate-pulse">
        AI compiling summary…
      </p>
      <div className="space-y-3">
        <div className="h-2.5 w-2/5 rounded-md summary-shimmer-bg ring-1 ring-white/[0.04]" />
        <div className="h-2.5 w-full rounded-md summary-shimmer-bg ring-1 ring-white/[0.04]" />
        <div className="h-2.5 w-[92%] rounded-md summary-shimmer-bg ring-1 ring-white/[0.04]" />
        <div className="h-2.5 w-4/5 rounded-md summary-shimmer-bg ring-1 ring-white/[0.04]" />
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
  /** Tracks which segment ids have their original (pre-translation) text expanded. */
  const [expandedOriginals, setExpandedOriginals] = useState<Set<string>>(new Set())

  const toggleOriginal = useCallback((id: string) => {
    setExpandedOriginals((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

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

  const [summaryOpen, setSummaryOpen] = useState(false)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Collapsible AI summary disclosure */}
      <div className="shrink-0 overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.02]">
        <button
          type="button"
          onClick={() => setSummaryOpen((o) => !o)}
          className="flex w-full items-center justify-between px-3 py-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/50"
          aria-expanded={summaryOpen}
        >
          <span className="flex items-center gap-2">
            <span className="dash-label tracking-[0.14em]">AI Summary</span>
            {summaryText && !summaryOpen ? (
              <span className="rounded-full border border-cyan-400/30 bg-[color-mix(in_srgb,var(--dash-accent)_10%,transparent)] px-1.5 py-0.5 font-data text-[9px] font-semibold uppercase tracking-[0.1em] text-cyan-300/80">
                ready
              </span>
            ) : isGenerating ? (
              <span className="font-data text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--dash-text-secondary)] motion-safe:animate-pulse">
                generating…
              </span>
            ) : null}
          </span>
          <span className="font-data text-[11px] text-[var(--dash-text-secondary)]" aria-hidden>
            {summaryOpen ? '▲' : '▼'}
          </span>
        </button>

        {summaryOpen ? (
          <div className="border-t border-white/[0.06] px-3 pb-3 pt-2" aria-live="polite" data-summary-requested={isSummaryRequested ? 'true' : 'false'}>
            <button
              type="button"
              onClick={onGenerateClick}
              disabled={!wsConnected || isGenerating}
              title={wsConnected ? undefined : 'Connect to telemetry service to request a summary'}
              className="group relative mb-3 w-full overflow-hidden rounded-lg border border-cyan-300/25 bg-white/[0.05] px-4 py-2.5 text-center text-sm font-bold tracking-[0.08em] text-cyan-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_12px_32px_rgba(0,229,255,0.08)] transition-all duration-200 before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-cyan-200/70 before:to-transparent hover:border-cyan-200/55 hover:bg-white/[0.075] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-200/70 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isGenerating ? 'Working…' : primaryLabel}
            </button>

            {isGenerating && !summaryText ? <SummaryLoadingPanel /> : null}
            {!isGenerating && errorText ? (
              <div className="relative overflow-hidden rounded-lg border border-red-400/25 bg-[color-mix(in_srgb,#FF52520e%,rgba(0,0,0,0.4))] p-4 shadow-[inset_0_1px_0_rgba(255,82,82,0.1)]">
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-400/50 to-transparent" />
                <p className="text-sm leading-relaxed text-[#FFAB91]">{errorText}</p>
                <button
                  type="button"
                  onClick={onTryAgainAfterError}
                  className="relative mt-4 overflow-hidden rounded-md border border-white/[0.09] bg-white/[0.04] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#E0E0E0] shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] transition-all hover:bg-white/[0.07] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50"
                >
                  Try again
                </button>
              </div>
            ) : null}
            {summaryText !== null && !errorText ? (
              <div
                className={cn(
                  'relative overflow-hidden rounded-lg border border-white/[0.07] bg-white/[0.02] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-sm',
                  isGenerating && 'opacity-55',
                )}
              >
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/25 to-transparent" />
                {isGenerating ? (
                  <p className="mb-3 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--dash-text-secondary)] motion-safe:animate-pulse">
                    Refreshing summary from live transcript…
                  </p>
                ) : null}
                <p className="font-sans text-sm font-normal leading-relaxed tracking-normal text-[#E0E0E0]">{summaryText}</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <section
        className="dash-card flex max-h-[min(34rem,60svh)] min-h-0 flex-1 flex-col overflow-hidden"
        aria-label="911 phone call transcript"
      >
        <header className="relative shrink-0 overflow-hidden border-b border-white/[0.06] px-4 py-3">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/20 to-transparent" />
          <p className="dash-label tracking-[0.14em]">Call transcript</p>
          <p className="mt-1 text-sm font-semibold text-[var(--dash-text-primary)]">911 voice line · both sides</p>
          <p
            className="mt-1 font-data text-[11px] font-medium tabular-nums text-[var(--dash-text-secondary)]"
            aria-live="polite"
          >
            Local time <span className="text-[var(--dash-text-primary)]">{liveTime}</span>
          </p>
        </header>
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
              <div className="mb-4 rounded-lg bg-[color-mix(in_srgb,var(--dash-accent)_10%,var(--dash-surface-raised))] px-3 py-2 ring-1 ring-[color-mix(in_srgb,var(--dash-accent)_22%,transparent)]">
                <p className="dash-label text-[color-mix(in_srgb,var(--dash-accent)_70%,var(--dash-text-secondary))]">
                  Telephony ingest
                </p>
                <p className="mt-1 text-sm font-medium leading-snug text-[var(--dash-text-primary)]">
                  Raw lines below mirror dual-channel STT. Summaries use the backend ingest buffer — send{' '}
                  <span className="font-data text-[11px]">request.summary</span> over the telemetry WebSocket (Generate or
                  refresh above). Waiting for dual-channel STT from the caller and dispatcher.
                </p>
              </div>
            ) : null}
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
                        isDispatcher
                          ? 'max-w-[82%] rounded-2xl rounded-br-sm bg-[color-mix(in_srgb,#00E5FF_16%,var(--dash-surface-raised))] px-3 py-2 text-right text-sm font-medium leading-relaxed text-[#B2EBF2] ring-1 ring-[color-mix(in_srgb,#00E5FF_28%,transparent)]'
                          : isAi
                            ? 'max-w-[82%] rounded-2xl rounded-bl-sm rounded-br-sm bg-white/[0.04] px-3 py-2 text-sm font-medium leading-relaxed text-[var(--dash-text-secondary)] ring-1 ring-white/[0.06]'
                            : 'max-w-[82%] rounded-2xl rounded-bl-sm bg-[var(--dash-surface-raised)] px-3 py-2 text-sm font-medium leading-relaxed text-[var(--dash-text-primary)] ring-1 ring-white/[0.05]',
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
                        {line.original_text ? (
                          <span className="rounded-full border border-cyan-400/30 bg-[color-mix(in_srgb,var(--dash-accent)_10%,transparent)] px-1.5 py-0.5 font-data text-[9px] font-semibold uppercase tracking-[0.1em] text-cyan-300/80">
                            EN
                          </span>
                        ) : null}
                      </p>
                      <p
                        className={cn(
                          'mt-1',
                          isDispatcher && 'text-right',
                        )}
                      >
                        {line.text}
                      </p>
                      {line.original_text ? (
                        <div className={cn('mt-1', isDispatcher && 'text-right')}>
                          <button
                            type="button"
                            onClick={() => toggleOriginal(line.id)}
                            className="font-data text-[9px] font-semibold uppercase tracking-[0.1em] text-cyan-300/50 hover:text-cyan-300/80 focus:outline-none"
                          >
                            {expandedOriginals.has(line.id) ? 'Hide original ▲' : 'Show original ▼'}
                          </button>
                          {expandedOriginals.has(line.id) ? (
                            <p className={cn('mt-0.5 font-data text-[10px] italic text-[var(--dash-text-secondary)] opacity-75')}>
                              {line.original_text}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
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
