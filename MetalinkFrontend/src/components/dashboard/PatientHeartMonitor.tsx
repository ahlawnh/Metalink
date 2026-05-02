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
  borderClass: string
  panelBgClass: string
  ribbonClass: string
  animateBorder: boolean
  liveLevel: 'off' | 'polite' | 'assertive'
}

function presentationFor(mode: PatientCardiacMode): ModePresentation {
  switch (mode) {
    case 'stable':
      return {
        label: 'Stable rhythm',
        bpmClass: 'text-emerald-400',
        strokeClass: 'stroke-emerald-400',
        borderClass: 'border-2 border-transparent',
        panelBgClass: 'bg-zinc-900',
        ribbonClass: 'bg-emerald-950/55 text-emerald-100 border-emerald-800/70',
        animateBorder: false,
        liveLevel: 'polite',
      }
    case 'elevated_stress':
      return {
        label: 'Elevated stress / HR ↑',
        bpmClass: 'text-amber-300',
        strokeClass: 'stroke-amber-400',
        borderClass: 'border-2 border-transparent',
        panelBgClass: 'bg-zinc-900',
        ribbonClass: 'bg-amber-950/55 text-amber-50 border-amber-700/65',
        animateBorder: false,
        liveLevel: 'polite',
      }
    case 'hypoperfusion_watch':
      return {
        label: 'Low output watch (bradycardia-proxy)',
        bpmClass: 'text-orange-300',
        strokeClass: 'stroke-orange-400',
        borderClass: 'border-2 border-transparent border-orange-500/40',
        panelBgClass: 'bg-orange-950/15',
        ribbonClass: 'bg-orange-950/60 text-orange-50 border-orange-600/60',
        animateBorder: false,
        liveLevel: 'polite',
      }
    case 'compensatory_tachycardia':
      return {
        label: 'Compensatory tachycardia',
        bpmClass: 'text-orange-200',
        strokeClass: 'stroke-orange-300',
        borderClass: 'border-2 border-orange-400/65',
        panelBgClass: 'bg-orange-950/25',
        ribbonClass: 'bg-orange-950/70 text-orange-50 border-orange-500/80',
        animateBorder: false,
        liveLevel: 'assertive',
      }
    case 'critical_intervention':
      return {
        label: 'CRITICAL · prepare CPR / AED per protocol',
        bpmClass: 'text-red-200',
        strokeClass: 'stroke-red-400',
        borderClass: 'border-2 border-red-500',
        panelBgClass: 'bg-red-950/35',
        ribbonClass: 'bg-red-950/80 text-red-50 border-red-500',
        animateBorder: true,
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
        'relative shrink-0 overflow-hidden rounded-xl p-4 shadow-md shadow-black/25 transition-colors duration-300',
        theme.borderClass,
        theme.panelBgClass,
        theme.animateBorder && 'animate-pulse',
      )}
      aria-label={`Injured person heart estimate ${patient.heart_rate_bpm} BPM, mode ${patient.mode}`}
    >
      <div
        className={cn('mb-3 rounded-lg border px-3 py-2 text-xs uppercase tracking-wide', theme.ribbonClass)}
        {...(theme.liveLevel !== 'off'
          ? { role: 'status', 'aria-live': theme.liveLevel as 'polite' | 'assertive' }
          : {})}
      >
        {patient.mode.split('_').join(' ')} · {theme.label}
      </div>

      <p className="text-xs uppercase tracking-widest text-zinc-400">
        Injured person (RPPG / mock) · {patient.signal_source === 'mock' ? 'training feed' : 'live estimate'}
      </p>
      <p className="mt-1 text-sm text-zinc-300">{patient.dispatcher_notice}</p>

      <div className="mt-3 flex flex-wrap items-end gap-4">
        <div>
          <p className={cn('text-5xl font-bold tabular-nums leading-none transition-colors', theme.bpmClass)}>
            {patient.heart_rate_bpm}
          </p>
          <p className="mt-1 text-xs uppercase tracking-widest text-zinc-500">BPM (est.)</p>
        </div>
        <div
          className="relative min-h-[3rem] min-w-[140px] flex-1 rounded-md border border-zinc-800 bg-zinc-950 pt-2"
          aria-hidden
        >
          {path ? (
            <svg className="h-12 w-full" viewBox="0 0 220 48" preserveAspectRatio="none">
              <path d="M0 24 H220" className={cn('stroke-zinc-700', 'fill-none')} strokeWidth="0.75" vectorEffect="non-scaling-stroke" />
              <path
                d={path}
                className={cn('fill-none', theme.strokeClass, theme.animateBorder ? 'animate-pulse' : '')}
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          ) : (
            <div className="flex h-full items-center justify-center text-[11px] text-zinc-500">Insufficient samples</div>
          )}
        </div>
      </div>
    </section>
  )
}
