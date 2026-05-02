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
        // Keep border width constant to prevent layout shift during alert transitions.
        'rounded-xl border-2 border-transparent bg-zinc-900 p-5 shadow-md shadow-black/25 transition-colors duration-300',
        isCritical && 'border-red-500 bg-red-950/25 animate-pulse',
      )}
      aria-label="Respiratory telemetry"
    >
      <p className="text-xs uppercase tracking-widest text-zinc-400">Estimated Respiratory Rate</p>

      <div className="mt-3 flex items-end gap-3">
        <span className="text-6xl font-bold leading-none text-zinc-50">
          {telemetry.estimated_respiratory_rate}
        </span>
        <span className="pb-1 text-xs uppercase tracking-widest text-zinc-400">breaths/min</span>
      </div>

      <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
        <p className="text-xs uppercase tracking-widest text-zinc-400">Respiratory Status</p>
        <p className={cn('mt-1 text-lg font-semibold text-zinc-100', isCritical && 'text-red-300')}>
          {telemetry.respiratory_status}
        </p>
      </div>
    </section>
  )
}
