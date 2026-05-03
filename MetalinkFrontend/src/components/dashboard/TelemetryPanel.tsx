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
  bad: 'text-[#FF9100] drop-shadow-[0_0_8px_rgba(255,145,0,0.24)]',
  good: 'text-[#00FF88] drop-shadow-[0_0_8px_rgba(0,255,136,0.22)]',
  moderate: 'text-[#FFEA00] drop-shadow-[0_0_8px_rgba(255,234,0,0.22)]',
  dangerous: 'text-[#FF5252] drop-shadow-[0_0_10px_rgba(255,82,82,0.32)]',
}

export default function TelemetryPanel({ telemetry }: TelemetryPanelProps) {
  const normalizedStatus = telemetry.respiratory_status.toLowerCase()
  const isCritical = normalizedStatus === 'critical'
  const rate = telemetry.estimated_respiratory_rate
  const hasNumericRate = typeof rate === 'number' && Number.isFinite(rate) && rate > 0
  const showRespPlaceholder = !hasNumericRate && !isCritical
  const rrBand = hasNumericRate ? respiratoryRateBand(rate) : null
  const rateColorClass =
    isCritical
      ? 'text-[var(--dash-critical)] drop-shadow-[0_0_10px_rgba(239,83,80,0.34)]'
      : rrBand != null
        ? RR_BAND_TEXT[rrBand]
        : 'text-[var(--dash-text-secondary)]'

  return (
    <section
      className={cn(
        'dash-card relative overflow-hidden p-5 transition-all duration-300',
        isCritical
          ? 'ring-2 ring-[var(--dash-critical)] shadow-[0_4px_28px_rgba(239,83,80,0.28)] animate-pulse before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-red-400/80 before:to-transparent'
          : 'before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-cyan-400/20 before:to-transparent',
      )}
      aria-label="Respiratory telemetry"
    >
      <p className="dash-label tracking-[0.14em]">Estimated respiratory rate</p>

      <div className="mt-3 flex items-end gap-3">
        <span
          className={cn(
            'font-data text-6xl font-extrabold tabular-nums leading-none tracking-tight transition-colors',
            rateColorClass,
          )}
        >
          {hasNumericRate ? rate : '—'}
        </span>
        <span className="dash-label pb-1 tracking-[0.14em]">breaths / min</span>
      </div>

      <div className="dash-inset mt-5 px-3 py-2.5">
        <p className="dash-label tracking-[0.14em]">Respiratory status</p>
        <p
          className={cn(
            'mt-1 text-base font-bold tracking-wide text-[var(--dash-text-primary)]',
            isCritical && 'text-[var(--dash-critical)] drop-shadow-[0_0_8px_rgba(239,83,80,0.32)]',
          )}
        >
          {showRespPlaceholder ? '—' : telemetry.respiratory_status}
        </p>
      </div>
    </section>
  )
}
