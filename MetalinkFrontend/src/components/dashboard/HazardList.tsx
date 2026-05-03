import type { HazardTelemetry } from '@/types/dashboard'

interface HazardListProps {
  hazards: HazardTelemetry[]
}

export default function HazardList({ hazards }: HazardListProps) {
  return (
    <section className="dash-card p-5">
      <p className="dash-label">Hazards detected</p>
      <ul className="mt-4 space-y-2">
        {hazards.length === 0 ? (
          <li className="dash-inset px-3 py-2 text-sm text-[var(--dash-text-secondary)]">None detected</li>
        ) : (
          hazards.map((hazard) => (
            <li key={hazard.id} className="dash-inset px-3 py-2">
              <p className="text-sm font-semibold text-[var(--dash-text-primary)]">{hazard.type}</p>
              <p className="dash-label mt-1">
                {hazard.severity} ·{' '}
                <span className="font-data normal-case tracking-normal text-[var(--dash-text-secondary)]">
                  {Math.round(hazard.confidence * 100)}% confidence
                </span>
              </p>
            </li>
          ))
        )}
      </ul>
    </section>
  )
}
