import { useMemo, useRef } from 'react'
import { useSmoothedBpm } from '@/hooks/useSmoothedBpm'
import { useSmoothedRr } from '@/hooks/useSmoothedRr'
import { cn } from '@/lib/utils'
import type { PatientCardiacMode, PatientHeartTelemetry, RespiratoryTelemetry, RespiratoryStatus } from '@/types/dashboard'

function hasHeartRateData(p: PatientHeartTelemetry): boolean {
  if (p.heart_rate_bpm <= 0) return false
  if (p.signal_source === 'rppg') return true
  return p.signal_source !== 'unknown' && p.history_bpm.length > 0
}

function hasRespiratoryData(r: RespiratoryTelemetry): boolean {
  if (r.estimated_respiratory_rate <= 0) return false
  if (r.source === 'rppg' || r.source === 'ai') return true
  return r.source === 'mock' && (r.history_rr?.length ?? 0) > 0
}

interface VitalsTelemetryCardsProps {
  patient: PatientHeartTelemetry
  respiratory: RespiratoryTelemetry
  /** Changes when telemetry snapshot updates (e.g. WS `updatedAt`) — nudges smoothed digits. */
  telemetryCueRevision?: number
}

function rrStatusTone(status: RespiratoryStatus): string {
  switch (status) {
    case 'normal':
      return 'text-[#00FF88]'
    case 'watch':
      return 'text-[#FFB74D]'
    case 'critical':
      return 'text-[#FF1744]'
    default:
      return 'text-[var(--dash-text-primary)]'
  }
}

function rrStrokeFor(status: RespiratoryStatus): string {
  switch (status) {
    case 'normal':
      return 'stroke-[#00FF88]'
    case 'watch':
      return 'stroke-[#FFB74D]'
    case 'critical':
      return 'stroke-[#FF1744]'
    default:
      return 'stroke-[var(--dash-text-primary)]'
  }
}

function clampHistory(samples: number[], maxPoints: number): number[] {
  if (samples.length <= maxPoints) return samples
  return samples.slice(samples.length - maxPoints)
}

function buildSparkPath(samples: number[], width: number, height: number): string | null {
  if (samples.length < 2) return null
  const min = Math.min(...samples)
  const max = Math.max(...samples)
  const spread = Math.max(max - min, 1)
  const padY = 6
  const usableH = height - padY * 2
  return samples
    .map((value, index) => {
      const x = (index / (samples.length - 1)) * width
      const y = height - padY - ((value - min) / spread) * usableH
      return `${index === 0 ? 'M' : 'L'} ${x} ${Number.isFinite(y) ? y : height / 2}`
    })
    .join(' ')
}

function presentationFor(mode: PatientCardiacMode): { bpmClass: string; strokeClass: string } {
  switch (mode) {
    case 'stable':
      return { bpmClass: 'text-[#00FF88]', strokeClass: 'stroke-[#00FF88]' }
    case 'elevated_stress':
      return { bpmClass: 'text-[#FFEA00]', strokeClass: 'stroke-[#FFEA00]' }
    case 'hypoperfusion_watch':
      return { bpmClass: 'text-[#FF9100]', strokeClass: 'stroke-[#FF9100]' }
    case 'compensatory_tachycardia':
      return { bpmClass: 'text-[#FF5722]', strokeClass: 'stroke-[#FF5722]' }
    case 'critical_intervention':
      return { bpmClass: 'text-[#FF1744]', strokeClass: 'stroke-[#FF1744]' }
    default:
      return { bpmClass: 'text-[#00FF88]', strokeClass: 'stroke-[#00FF88]' }
  }
}

const telemetrySurface =
  'rounded-xl bg-[#1E1E1E] p-2 shadow-[0_4px_24px_rgba(0,0,0,0.55)] sm:p-2'

/** Twin vitals panels — HR / RR live from WebSocket telemetry; monospace numerics for stable layout. */
export default function VitalsTelemetryCards({
  patient,
  respiratory,
  telemetryCueRevision = 0,
}: VitalsTelemetryCardsProps) {
  const hrPresent = hasHeartRateData(patient)
  const rrPresent = hasRespiratoryData(respiratory)

  const hrTheme = presentationFor(patient.mode)
  const displayedBpm = useSmoothedBpm(patient.heart_rate_bpm, telemetryCueRevision)

  const lastGoodRrRef = useRef(
    respiratory.estimated_respiratory_rate > 0 ? respiratory.estimated_respiratory_rate : 16,
  )
  if (respiratory.estimated_respiratory_rate > 0) {
    lastGoodRrRef.current = respiratory.estimated_respiratory_rate
  }
  const rrSmoothTarget =
    respiratory.estimated_respiratory_rate > 0 ? respiratory.estimated_respiratory_rate : lastGoodRrRef.current
  const displayedRr = useSmoothedRr(rrSmoothTarget, telemetryCueRevision)

  const rrTone = rrStatusTone(respiratory.respiratory_status)

  const hrSamples = clampHistory(patient.history_bpm, 32)
  const hrPath = useMemo(() => buildSparkPath(hrSamples, 220, 44), [hrSamples])

  const rrSamples = clampHistory(respiratory.history_rr ?? [], 32)
  const rrPath = useMemo(() => buildSparkPath(rrSamples, 220, 44), [rrSamples])

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <section className={telemetrySurface} aria-label="Patient heart rate">
        <p className="dash-label px-1 pb-1">Heart rate</p>
        <div className="rounded-lg px-1 pt-1">
          <div className="flex flex-wrap items-end gap-2">
            {hrPresent ? (
              <>
                <p
                  className={cn(
                    'font-data text-[clamp(2rem,6vw,3rem)] font-extrabold tabular-nums leading-none tracking-tight transition-colors',
                    hrTheme.bpmClass,
                  )}
                >
                  {displayedBpm}
                </p>
                <span className="dash-label px-1 pb-1 normal-case">BPM</span>
              </>
            ) : (
              <p className="text-sm font-medium leading-snug text-[var(--dash-text-secondary)]">No data</p>
            )}
          </div>
          <div className="mt-2 px-1 pb-1" aria-hidden>
            {hrPresent && hrPath ? (
              <svg className="h-10 w-full" viewBox="0 0 220 44" preserveAspectRatio="none">
                <path
                  d="M0 22 H220"
                  className="stroke-[var(--dash-text-secondary)] opacity-25"
                  fill="none"
                  strokeWidth="0.75"
                  vectorEffect="non-scaling-stroke"
                />
                <path
                  d={hrPath}
                  className={cn('fill-none', hrTheme.strokeClass)}
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            ) : null}
          </div>
        </div>
      </section>

      <section className={telemetrySurface} aria-label="Patient respiratory rate">
        <p className="dash-label px-1 pb-1">Respiratory rate</p>
        <div className="rounded-lg px-1 pt-1">
          <div className="flex flex-wrap items-end gap-2">
            {rrPresent ? (
              <>
                <p
                  className={cn(
                    'font-data text-[clamp(2rem,6vw,3rem)] font-extrabold tabular-nums leading-none tracking-tight',
                    rrTone,
                  )}
                >
                  {displayedRr}
                </p>
                <span className="dash-label px-1 pb-1 normal-case">BrPM</span>
              </>
            ) : (
              <p className="text-sm font-medium leading-snug text-[var(--dash-text-secondary)]">No data</p>
            )}
          </div>
          <div className="mt-2 px-1 pb-1" aria-hidden>
            {rrPresent && rrPath ? (
              <svg className="h-10 w-full" viewBox="0 0 220 44" preserveAspectRatio="none">
                <path
                  d="M0 22 H220"
                  className="stroke-[var(--dash-text-secondary)] opacity-25"
                  fill="none"
                  strokeWidth="0.75"
                  vectorEffect="non-scaling-stroke"
                />
                <path
                  d={rrPath}
                  className={cn('fill-none', rrStrokeFor(respiratory.respiratory_status))}
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            ) : null}
          </div>
          {rrPresent ? (
            <>
              <p className="mt-2 px-1 font-data text-[11px] tabular-nums uppercase tracking-[0.08em] text-[var(--dash-text-secondary)]">
                Status ·{' '}
                <span className={cn('font-semibold', rrTone)}>
                  {respiratory.respiratory_status.replace(/_/g, ' ')}
                </span>
              </p>
              <p className="mt-1 px-1 font-data text-[10px] tabular-nums text-[var(--dash-text-secondary)] opacity-90">
                Conf {(respiratory.confidence * 100).toFixed(0)}% · {respiratory.source}
              </p>
            </>
          ) : null}
        </div>
      </section>
    </div>
  )
}
