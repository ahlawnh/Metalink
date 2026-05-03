import type { TranscriptAISummaryTelemetry } from '@/types/dashboard'

interface TranscriptAISummaryCardProps {
  summary: TranscriptAISummaryTelemetry
}

function SummarySkeleton() {
  return (
    <div
      className="animate-pulse space-y-3"
      aria-busy="true"
      aria-label="Generating transcript summary"
    >
      <div className="h-3 w-2/5 rounded-md bg-[color-mix(in_srgb,var(--dash-text-secondary)_22%,transparent)]" />
      <div className="h-3 w-full rounded-md bg-[color-mix(in_srgb,var(--dash-text-secondary)_14%,transparent)]" />
      <div className="h-3 w-[92%] rounded-md bg-[color-mix(in_srgb,var(--dash-text-secondary)_14%,transparent)]" />
      <div className="h-3 w-4/5 rounded-md bg-[color-mix(in_srgb,var(--dash-text-secondary)_14%,transparent)]" />
    </div>
  )
}

export default function TranscriptAISummaryCard({ summary }: TranscriptAISummaryCardProps) {
  return (
    <section
      className="dash-card shrink-0 p-4 ring-2 ring-[color-mix(in_srgb,var(--dash-accent)_28%,transparent)]"
      aria-label="AI transcript summary"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="dash-label text-[color-mix(in_srgb,var(--dash-accent)_75%,var(--dash-text-secondary))]">
            AI-assisted · dual-channel STT
          </p>
          <h2 className="mt-1 text-lg font-bold tracking-tight text-[var(--dash-text-primary)]">
            Transcript summary
          </h2>
        </div>
        {summary.status === 'loading' ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-[var(--dash-surface-raised)] px-2.5 py-1 font-data text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--dash-accent)] ring-1 ring-[color-mix(in_srgb,var(--dash-accent)_35%,transparent)]">
            <span className="relative flex size-2 items-center justify-center">
              <span className="absolute size-2 animate-ping rounded-full bg-[var(--dash-accent)] opacity-35" />
              <span className="relative size-1.5 rounded-full bg-[var(--dash-accent)]" />
            </span>
            Generating
          </span>
        ) : summary.status === 'ready' ? (
          <span className="rounded-full bg-[color-mix(in_srgb,#00FF8822_35%,var(--dash-surface-raised))] px-2.5 py-1 font-data text-[10px] font-semibold uppercase tracking-[0.14em] text-[#00FF88] ring-1 ring-[color-mix(in_srgb,#00FF88_35%,transparent)]">
            Ready
          </span>
        ) : summary.status === 'error' ? (
          <span className="rounded-full bg-[color-mix(in_srgb,#FF174428%,var(--dash-surface-raised))] px-2.5 py-1 font-data text-[10px] font-semibold uppercase tracking-[0.14em] text-[#FF5252] ring-1 ring-[color-mix(in_srgb,#FF1744_35%,transparent)]">
            Error
          </span>
        ) : (
          <span className="rounded-full bg-[var(--dash-surface-raised)] px-2.5 py-1 font-data text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--dash-text-secondary)] ring-1 ring-white/[0.06]">
            Idle
          </span>
        )}
      </div>

      <div className="mt-4 min-h-[4.5rem]">
        {summary.status === 'loading' ? (
          <SummarySkeleton />
        ) : summary.status === 'error' ? (
          <p className="text-sm leading-relaxed text-[#FFAB91]">
            {summary.error_detail ?? 'Summary service unavailable. Raw transcript remains authoritative.'}
          </p>
        ) : summary.status === 'ready' && summary.text?.trim() ? (
          <>
            <p className="text-sm font-medium leading-relaxed text-[var(--dash-text-primary)]">{summary.text}</p>
            {summary.updated_at ? (
              <p className="mt-3 font-data text-[11px] tabular-nums text-[var(--dash-text-secondary)]">
                Updated {new Date(summary.updated_at).toLocaleString()}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-[var(--dash-text-secondary)]">
            Waiting on enough dual-channel speech for an LLM recap. Lines below stay live.
          </p>
        )}
      </div>
    </section>
  )
}
