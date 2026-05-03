import TranscriptAISummaryCard from '@/components/dashboard/TranscriptAISummaryCard'
import { useNow } from '@/hooks/useNow'
import type { TranscriptAISummaryTelemetry, TranscriptChunk } from '@/types/dashboard'

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
  aiSummary: TranscriptAISummaryTelemetry
}

export default function TranscriptSummary({ chunks, aiSummary }: TranscriptSummaryProps) {
  const now = useNow(1000)
  const ordered = [...chunks].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  const liveTime = now.toLocaleTimeString()

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <TranscriptAISummaryCard summary={aiSummary} />

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
              Dual-channel STT lines stream below; the summary card above refreshes when the LLM ingest completes on new
              speech windows.
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
