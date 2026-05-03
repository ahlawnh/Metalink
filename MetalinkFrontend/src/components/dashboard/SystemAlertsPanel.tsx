import type { HazardTelemetry } from '@/types/dashboard'

interface SystemAlertsPanelProps {
  alerts: HazardTelemetry[]
}

/** Pipeline / ingest / service messages that must not be confused with on-scene hazards. */
export default function SystemAlertsPanel({ alerts }: SystemAlertsPanelProps) {
  if (alerts.length === 0) return null

  return (
    <section
      className="dash-card border border-[color-mix(in_srgb,#FFB300_35%,transparent)] bg-[color-mix(in_srgb,#FFB300_08%,var(--dash-surface))] p-5"
      aria-label="System and pipeline status"
    >
      <p className="dash-label">System status</p>
      <p className="mt-1 text-xs text-[var(--dash-text-secondary)]">
        Telemetry service / pipeline — not scene safety from the camera.
      </p>
      <ul className="mt-3 space-y-2">
        {alerts.map((a) => (
          <li key={a.id} className="dash-inset px-3 py-2">
            <p className="text-sm font-semibold text-[var(--dash-text-primary)]">{a.type}</p>
            <p className="mt-1 text-sm leading-snug text-[var(--dash-text-secondary)]">{a.description}</p>
            <p className="dash-label mt-1">
              {a.severity}
              <span className="font-data normal-case tracking-normal">
                {' '}
                · {Math.round(a.confidence * 100)}% confidence
              </span>
            </p>
          </li>
        ))}
      </ul>
    </section>
  )
}
