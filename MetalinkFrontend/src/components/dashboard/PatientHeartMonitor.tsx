import { useMemo } from 'react'
import { useSmoothedBpm } from '@/hooks/useSmoothedBpm'
import { cn } from '@/lib/utils'
import type { PatientCardiacMode, PatientHeartTelemetry } from '@/types/dashboard'

interface PatientHeartMonitorProps {
  patient: PatientHeartTelemetry
}

interface ModePresentation {
  bpmClass: string
  strokeClass: string
  ribbonClass: string
  outerAccentClass: string
  sparkPulse: boolean
}

/** BPM + sparkline: #00FF88 good · #FFEA00 / #FF9100 / #FF5722 needs-work ladder · #FF1744 critical (literals for Tailwind). */

function presentationFor(mode: PatientCardiacMode): ModePresentation {
  const ribbonBase =
    'rounded-md px-2 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-white/[0.06]'
  switch (mode) {
    case 'stable':
      return {
        bpmClass: 'text-[#00FF88]',
        strokeClass: 'stroke-[#00FF88]',
        ribbonClass: cn(
          ribbonBase,
          'border-l-[3px] border-[#00FF88] bg-[var(--dash-surface-raised)] text-[var(--dash-text-primary)]',
        ),
        outerAccentClass: '',
        sparkPulse: false,
      }
    case 'elevated_stress':
      return {
        bpmClass: 'text-[#FFEA00]',
        strokeClass: 'stroke-[#FFEA00]',
        ribbonClass: cn(
          ribbonBase,
          'border-l-[3px] border-[#FFEA00] bg-[var(--dash-surface-raised)] text-[var(--dash-text-primary)]',
        ),
        outerAccentClass: '',
        sparkPulse: false,
      }
    case 'hypoperfusion_watch':
      return {
        bpmClass: 'text-[#FF9100]',
        strokeClass: 'stroke-[#FF9100]',
        ribbonClass: cn(
          ribbonBase,
          'border-l-[3px] border-[#FF9100] bg-[var(--dash-surface-raised)] text-[var(--dash-text-primary)]',
        ),
        outerAccentClass: '',
        sparkPulse: false,
      }
    case 'compensatory_tachycardia':
      return {
        bpmClass: 'text-[#FF5722]',
        strokeClass: 'stroke-[#FF5722]',
        ribbonClass: cn(
          ribbonBase,
          'border-l-[3px] border-[#FF5722] bg-[color-mix(in_srgb,#FF5722_14%,var(--dash-surface))] text-[var(--dash-text-primary)]',
        ),
        outerAccentClass: 'ring-2 ring-[#FF5722]/75',
        sparkPulse: false,
      }
    case 'critical_intervention':
      return {
        bpmClass: 'text-[#FF1744]',
        strokeClass: 'stroke-[#FF1744]',
        ribbonClass: cn(
          ribbonBase,
          'border-l-[3px] border-[#FF1744] bg-[color-mix(in_srgb,#FF1744_28%,var(--dash-surface))] text-[var(--dash-text-primary)] ring-[color-mix(in_srgb,#FF1744_60%,transparent)]',
        ),
        outerAccentClass: 'animate-pulse ring-2 ring-[#FF1744]',
        sparkPulse: true,
      }
    default:
      return presentationFor('stable')
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

export default function PatientHeartMonitor({ patient }: PatientHeartMonitorProps) {
  const theme = presentationFor(patient.mode)
  const samples = clampHistory(patient.history_bpm, 32)
  const path = useMemo(() => buildSparkPath(samples, 220, 44), [samples])

  const displayedBpm = useSmoothedBpm(patient.heart_rate_bpm, 0)

  const warningLine = patient.mode.replace(/_/g, ' ').toUpperCase()
  const liveLevel = patient.mode === 'critical_intervention' ? 'assertive' : 'polite'

  return (
    <section
      className={cn(
        'dash-card relative shrink-0 overflow-hidden p-3 transition-[box-shadow] duration-300',
        theme.outerAccentClass,
      )}
      aria-label={`Injured person heart estimate ${displayedBpm} BPM, mode ${patient.mode}`}
    >
      <div
        className={cn('mb-2', theme.ribbonClass)}
        role="status"
        aria-live={liveLevel as 'polite' | 'assertive'}
      >
        {warningLine}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <p
          className={cn(
            'font-data text-5xl font-extrabold tabular-nums leading-none tracking-tight transition-colors',
            theme.bpmClass,
          )}
        >
          {displayedBpm}
        </p>
        <div className="dash-inset min-h-[2.35rem] min-w-[120px] flex-1 pt-1.5" aria-hidden>
          {path ? (
            <svg className="h-10 w-full" viewBox="0 0 220 44" preserveAspectRatio="none">
              <path
                d="M0 22 H220"
                className="stroke-[var(--dash-text-secondary)] opacity-35"
                fill="none"
                strokeWidth="0.75"
                vectorEffect="non-scaling-stroke"
              />
              <path
                d={path}
                className={cn('fill-none', theme.strokeClass, theme.sparkPulse && 'animate-pulse')}
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          ) : null}
        </div>
      </div>
    </section>
  )
}
