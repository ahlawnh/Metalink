import type { HazardTelemetry } from '@/types/dashboard'

interface HazardListProps {
  hazards: HazardTelemetry[]
}

export default function HazardList({ hazards }: HazardListProps) {
  return (
    <section className="rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-md shadow-black/25">
      <p className="text-xs uppercase tracking-widest text-zinc-400">Hazards Detected</p>
      <ul className="mt-4 space-y-2">
        {hazards.length === 0 ? (
          <li className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-400">
            None detected
          </li>
        ) : (
          hazards.map((hazard) => (
            <li
              key={hazard.id}
              className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm font-medium text-zinc-100"
            >
              <p>{hazard.type}</p>
              <p className="mt-1 text-xs uppercase tracking-wide text-zinc-400">
                {hazard.severity} - {Math.round(hazard.confidence * 100)}% confidence
              </p>
            </li>
          ))
        )}
      </ul>
    </section>
  )
}
