import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { useSmoothedBpm } from '@/hooks/useSmoothedBpm'
import { useSmoothedRr } from '@/hooks/useSmoothedRr'
import { cn } from '@/lib/utils'
import type {
  CprGuidanceTelemetry,
  PatientCardiacMode,
  PatientHeartTelemetry,
  RespiratoryTelemetry,
  RespiratoryStatus,
} from '@/types/dashboard'

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
  cprGuidance: CprGuidanceTelemetry
  onCprGuidance: (active: boolean, bpm: number | null) => void
  wsConnected: boolean
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

const cprPanelBtn =
  'rounded-md bg-[#2A2A2A] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--dash-text-primary)] ring-1 ring-white/[0.08] hover:bg-[#333] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dash-accent)] disabled:cursor-not-allowed disabled:opacity-45'

/** Main “CPR tempo” opener — high-contrast accent so it reads as primary action. */
const cprTriggerBtn =
  'rounded-md bg-cyan-500 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#0d1117] shadow-[0_0_14px_rgba(34,211,238,0.45)] ring-1 ring-cyan-300/90 hover:bg-cyan-400 hover:shadow-[0_0_18px_rgba(103,232,249,0.55)] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none'

const cprStopBtn =
  'rounded-md bg-red-600 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white ring-1 ring-red-500/60 hover:bg-red-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:cursor-not-allowed disabled:opacity-45'

function CprTempoControl({
  cprGuidance,
  onCprGuidance,
  wsConnected,
}: {
  cprGuidance: CprGuidanceTelemetry
  onCprGuidance: (active: boolean, bpm: number | null) => void
  wsConnected: boolean
}) {
  const [targetBpm, setTargetBpm] = useState(110)
  const [open, setOpen] = useState(false)
  const [panelStyle, setPanelStyle] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (cprGuidance.active && typeof cprGuidance.bpm === 'number') {
      setTargetBpm(cprGuidance.bpm)
    }
  }, [cprGuidance.active, cprGuidance.bpm])

  const handleToggle = useCallback(() => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPanelStyle({ top: rect.bottom + 6, left: rect.left })
    }
    setOpen((o) => !o)
  }, [open])

  const live = cprGuidance.active && typeof cprGuidance.bpm === 'number'

  return (
    <div className="flex items-center gap-1.5">
      {live ? (
        <span
          className="inline-flex items-center gap-1.5 rounded-full border border-red-500/50 bg-red-950/50 px-2 py-0.5 font-data text-[9px] font-semibold uppercase tracking-[0.1em] text-red-200"
          title="CPR tempo is broadcasting to the caller device"
        >
          <span className="size-1.5 animate-pulse rounded-full bg-red-400" />
          CPR {cprGuidance.bpm} BPM
        </span>
      ) : null}
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        className={cprTriggerBtn}
        title="CPR compression tempo for caller"
        aria-expanded={open}
      >
        CPR tempo
      </button>
      {open && panelStyle ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[80] cursor-default bg-transparent"
            aria-label="Close CPR tempo panel"
            onClick={() => setOpen(false)}
          />
          <div
            className="fixed z-[90] w-[min(100vw-2rem,17rem)] rounded-lg border border-white/[0.08] bg-[var(--dash-surface-raised)] p-3 shadow-xl ring-1 ring-black/40"
            style={{ top: panelStyle.top, left: panelStyle.left }}
          >
            <p className="dash-label pb-2 normal-case">Compression tempo (60–140 BPM)</p>
            <label className="flex flex-col gap-1">
              <span className="font-data text-xl font-bold tabular-nums text-[var(--dash-text-primary)]">
                {targetBpm}{' '}
                <span className="text-[11px] font-semibold text-[var(--dash-text-secondary)]">BPM</span>
              </span>
              <input
                type="range"
                min={60}
                max={140}
                step={1}
                value={targetBpm}
                onChange={(e) => setTargetBpm(Number(e.target.value))}
                disabled={live}
                className="w-full accent-[var(--dash-accent)] disabled:opacity-50"
              />
              <span className="flex justify-between font-data text-[10px] text-[var(--dash-text-secondary)]">
                <span>60</span>
                <span>140</span>
              </span>
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              {!live ? (
                <button
                  type="button"
                  className={cn(cprPanelBtn, 'bg-[color-mix(in_srgb,#FF174418%,var(--dash-bg))]')}
                  disabled={!wsConnected}
                  title={!wsConnected ? 'Connect to telemetry to send CPR tempo' : undefined}
                  onClick={() => {
                    onCprGuidance(true, targetBpm)
                    setOpen(false)
                  }}
                >
                  Start guidance
                </button>
              ) : (
                <button
                  type="button"
                  className={cprStopBtn}
                  disabled={!wsConnected}
                  onClick={() => {
                    onCprGuidance(false, null)
                    setOpen(false)
                  }}
                >
                  Stop
                </button>
              )}
            </div>
            <p className="mt-2 text-[10px] leading-snug text-[var(--dash-text-secondary)]">
              Sends CPR tempo to the backend so the caller app can align prompts and feedback with compressions.
            </p>
          </div>
        </>
      ) : null}
    </div>
  )
}

/** Twin vitals panels — HR / RR live from WebSocket telemetry; monospace numerics for stable layout. */
export default function VitalsTelemetryCards({
  patient,
  respiratory,
  cprGuidance,
  onCprGuidance,
  wsConnected,
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
        <div className="flex flex-wrap items-start justify-between gap-2 px-1 pb-1">
          <p className="dash-label shrink-0">Heart rate</p>
          <CprTempoControl cprGuidance={cprGuidance} onCprGuidance={onCprGuidance} wsConnected={wsConnected} />
        </div>
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
