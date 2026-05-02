import { cn } from '@/lib/utils'
import type { RespiratoryTelemetry } from '@/types/dashboard'

interface TelemetryPanelProps {
  telemetry: RespiratoryTelemetry
}

export default function TelemetryPanel({ telemetry }: TelemetryPanelProps) {
  const normalizedStatus = telemetry.respiratory_status.toLowerCase()
  const isCritical = normalizedStatus === 'critical'

  return (
    <section
      className={cn(
        'dash-card p-5 transition-colors duration-300',
        isCritical &&
          'ring-2 ring-[var(--dash-critical)] shadow-[0_4px_28px_rgba(239,83,80,0.22)] animate-pulse',
      )}
      aria-label="Respiratory telemetry"
    >
      <p className="dash-label">Estimated respiratory rate</p>

      <div className="mt-3 flex items-end gap-3">
        <span
          className={cn(
            'font-data text-6xl font-extrabold tabular-nums leading-none tracking-tight text-[var(--dash-accent)]',
            isCritical && 'text-[var(--dash-critical)]',
          )}
        >
          {telemetry.estimated_respiratory_rate}
        </span>
        <span className="dash-label pb-1">breaths/min</span>
      </div>

      <div className="dash-inset mt-6 px-3 py-2">
        <p className="dash-label">Respiratory status</p>
        <p className={cn('mt-1 text-lg font-bold text-[var(--dash-text-primary)]', isCritical && 'text-[var(--dash-critical)]')}>
          {telemetry.respiratory_status}
        </p>
      </div>
    </section>
  )
}
