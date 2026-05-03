import { cn } from '@/lib/utils'
import type { RespiratoryTelemetry } from '@/types/dashboard'

interface TelemetryPanelProps {
  telemetry: RespiratoryTelemetry
}

/** RR bands (breaths/min): under 15 poor, 15–30 target, 31–50 elevated, over 50 very high. */
function respiratoryRateBand(rate: number): 'bad' | 'good' | 'moderate' | 'dangerous' {
  if (rate < 15) return 'bad'
  if (rate <= 30) return 'good'
  if (rate <= 50) return 'moderate'
  return 'dangerous'
}

const RR_BAND_TEXT: Record<ReturnType<typeof respiratoryRateBand>, string> = {
  bad: 'text-[#FF9100]',
  good: 'text-[#00FF88]',
  moderate: 'text-[#FFEA00]',
  dangerous: 'text-[#FF5252]',
}

export default function TelemetryPanel({ telemetry }: TelemetryPanelProps) {
  const normalizedStatus = telemetry.respiratory_status.toLowerCase()
  const isCritical = normalizedStatus === 'critical'
  const rate = telemetry.estimated_respiratory_rate
  const hasNumericRate = typeof rate === 'number' && Number.isFinite(rate) && rate > 0
  const showRespPlaceholder = !hasNumericRate && !isCritical
  const rrBand = hasNumericRate ? respiratoryRateBand(rate) : null
  const rateColorClass =
    isCritical ? 'text-[var(--dash-critical)]' : rrBand != null ? RR_BAND_TEXT[rrBand] : 'text-[var(--dash-text-secondary)]'

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
            'font-data text-6xl font-extrabold tabular-nums leading-none tracking-tight transition-colors',
            rateColorClass,
          )}
        >
          {hasNumericRate ? rate : '—'}
        </span>
        <span className="dash-label pb-1">breaths/min</span>
      </div>

      <div className="dash-inset mt-6 px-3 py-2">
        <p className="dash-label">Respiratory status</p>
        <p className={cn('mt-1 text-lg font-bold text-[var(--dash-text-primary)]', isCritical && 'text-[var(--dash-critical)]')}>
          {showRespPlaceholder ? '—' : telemetry.respiratory_status}
        </p>
      </div>
    </section>
  )
}
