import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import type { PatientCardiacMode, PatientHeartTelemetry } from '@/types/dashboard'

interface PatientHeartMonitorProps {
  patient: PatientHeartTelemetry
}

interface ModePresentation {
  label: string
  bpmClass: string
  strokeClass: string
  ribbonClass: string
  outerAccentClass: string
  sparkPulse: boolean
  liveLevel: 'off' | 'polite' | 'assertive'
}

/** BPM + sparkline: #00FF88 good · #FFEA00 / #FF9100 / #FF5722 needs-work ladder · #FF1744 critical (literals for Tailwind). */

function presentationFor(mode: PatientCardiacMode): ModePresentation {
  const ribbonBase =
    'rounded-lg px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-white/[0.06]'
  switch (mode) {
    case 'stable':
      return {
        label: 'Stable rhythm',
        bpmClass: 'text-[#00FF88]',
        strokeClass: 'stroke-[#00FF88]',
        ribbonClass: cn(
          ribbonBase,
          'border-l-[3px] border-[#00FF88] bg-[var(--dash-surface-raised)] text-[var(--dash-text-primary)]',
        ),
        outerAccentClass: '',
        sparkPulse: false,
        liveLevel: 'polite',
      }
    case 'elevated_stress':
      return {
        label: 'Elevated stress / HR ↑',
        bpmClass: 'text-[#FFEA00]',
        strokeClass: 'stroke-[#FFEA00]',
        ribbonClass: cn(
          ribbonBase,
          'border-l-[3px] border-[#FFEA00] bg-[var(--dash-surface-raised)] text-[var(--dash-text-primary)]',
        ),
        outerAccentClass: '',
        sparkPulse: false,
        liveLevel: 'polite',
      }
    case 'hypoperfusion_watch':
      return {
        label: 'Low output watch (bradycardia-proxy)',
        bpmClass: 'text-[#FF9100]',
        strokeClass: 'stroke-[#FF9100]',
        ribbonClass: cn(
          ribbonBase,
          'border-l-[3px] border-[#FF9100] bg-[var(--dash-surface-raised)] text-[var(--dash-text-primary)]',
        ),
        outerAccentClass: '',
        sparkPulse: false,
        liveLevel: 'polite',
      }
    case 'compensatory_tachycardia':
      return {
        label: 'Compensatory tachycardia',
        bpmClass: 'text-[#FF5722]',
        strokeClass: 'stroke-[#FF5722]',
        ribbonClass: cn(
          ribbonBase,
          'border-l-[3px] border-[#FF5722] bg-[color-mix(in_srgb,#FF5722_14%,var(--dash-surface))] text-[var(--dash-text-primary)]',
        ),
        outerAccentClass: 'ring-2 ring-[#FF5722]/75',
        sparkPulse: false,
        liveLevel: 'assertive',
      }
    case 'critical_intervention':
      return {
        label: 'CRITICAL · prepare CPR / AED per protocol',
        bpmClass: 'text-[#FF1744]',
        strokeClass: 'stroke-[#FF1744]',
        ribbonClass: cn(
          ribbonBase,
          'border-l-[3px] border-[#FF1744] bg-[color-mix(in_srgb,#FF1744_28%,var(--dash-surface))] text-[var(--dash-text-primary)] ring-[color-mix(in_srgb,#FF1744_60%,transparent)]',
        ),
        outerAccentClass: 'animate-pulse ring-2 ring-[#FF1744]',
        sparkPulse: true,
        liveLevel: 'assertive',
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
  const path = useMemo(() => buildSparkPath(samples, 220, 48), [samples])

  return (
    <section
      className={cn(
        'dash-card relative shrink-0 overflow-hidden p-4 transition-[box-shadow] duration-300',
        theme.outerAccentClass,
      )}
      aria-label={`Injured person heart estimate ${patient.heart_rate_bpm} BPM, mode ${patient.mode}`}
    >
      <div
        className={cn('mb-3', theme.ribbonClass)}
        {...(theme.liveLevel !== 'off'
          ? { role: 'status', 'aria-live': theme.liveLevel as 'polite' | 'assertive' }
          : {})}
      >
        {patient.mode.split('_').join(' ')} · {theme.label}
      </div>

      <p className="dash-label">
        Injured person (RPPG / mock) · {patient.signal_source === 'mock' ? 'training feed' : 'live estimate'}
      </p>
      <p className="mt-1 text-sm font-medium text-[var(--dash-text-primary)]">{patient.dispatcher_notice}</p>

      <div className="mt-3 flex flex-wrap items-end gap-4">
        <div>
          <p
            className={cn(
              'font-data text-6xl font-extrabold tabular-nums leading-none tracking-tight transition-colors',
              theme.bpmClass,
            )}
          >
            {patient.heart_rate_bpm}
          </p>
          <p className="dash-label mt-2">BPM (est.)</p>
        </div>
        <div className="dash-inset relative min-h-[3rem] min-w-[140px] flex-1 pt-2" aria-hidden>
          {path ? (
            <svg className="h-12 w-full" viewBox="0 0 220 48" preserveAspectRatio="none">
              <path
                d="M0 24 H220"
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
          ) : (
            <div className="flex h-full items-center justify-center text-[11px] text-[var(--dash-text-secondary)]">
              Insufficient samples
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
