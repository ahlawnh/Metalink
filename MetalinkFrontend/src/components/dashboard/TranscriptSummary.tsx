import { useNow } from '@/hooks/useNow'
import type { TranscriptChunk } from '@/types/dashboard'

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
}

export default function TranscriptSummary({ chunks }: TranscriptSummaryProps) {
  const now = useNow(1000)
  const ordered = [...chunks].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  const liveTime = now.toLocaleTimeString()

  return (
    <section
      className="flex min-h-0 flex-1 flex-col rounded-xl border border-zinc-700 bg-zinc-900 shadow-md shadow-black/25"
      aria-label="911 phone call transcript"
    >
      <header className="shrink-0 border-b border-zinc-800 px-4 py-3">
        <p className="text-xs uppercase tracking-widest text-zinc-400">Call transcript</p>
        <p className="mt-1 text-sm font-medium text-zinc-100">911 voice line · both sides</p>
        <p className="mt-1 text-xs tabular-nums text-zinc-500" aria-live="polite">
          Local time {liveTime}
        </p>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mb-4 rounded-lg border border-sky-500/30 bg-sky-950/20 px-3 py-2">
          <p className="text-xs uppercase tracking-wider text-sky-200">Telephony ingest</p>
          <p className="mt-1 text-sm leading-snug text-sky-50/90">
            Placeholder: caller and operator speech are transcribed from the active 911 phone session. Ingested lines
            appear below as <span className="font-semibold text-sky-100">Caller</span> or{' '}
            <span className="font-semibold text-sky-100">911 operator</span> when Hacker 4 delivers dual-channel STT
            over telemetry.
          </p>
        </div>
        {ordered.length === 0 ? (
          <p className="text-sm text-zinc-500">No transcript lines yet.</p>
        ) : (
          <ul className="space-y-3">
            {ordered.map((line) => (
              <li key={line.id} className="rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-2">
                <p className="text-xs uppercase tracking-wider text-zinc-500">
                  {formatSpeaker(line.speaker)} · {new Date(line.timestamp).toLocaleTimeString()}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-zinc-200">{line.text}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
