import { useCallback, useRef, useState } from 'react'
import CallerLocationMapPanel from '@/components/dashboard/CallerLocationMapPanel'
import DeployVideoCallPanel from '@/components/dashboard/DeployVideoCallPanel'
import DispatchPanel from '@/components/dashboard/DispatchPanel'
import HazardList from '@/components/dashboard/HazardList'
import SystemAlertsPanel from '@/components/dashboard/SystemAlertsPanel'
import VitalsTelemetryCards from '@/components/dashboard/VitalsTelemetryCards'
import TranscriptSummary from '@/components/dashboard/TranscriptSummary'
import VideoPlayer from '@/components/dashboard/VideoPlayer'
import { useTelemetryStream } from '@/hooks/useTelemetryStream'
import { cn } from '@/lib/utils'

const LEFT_DEFAULT = 320
const RIGHT_DEFAULT = 320
const SIDE_MIN = 200
const SIDE_MAX = 600

export function MainLayout() {
  const {
    telemetry,
    connectionState,
    wsLatencyMs,
    requestRollingSummary,
    subscribeRollingSummary,
    setCprGuidance,
    requestCallerLocationRefresh,
  } = useTelemetryStream()

  const connectionLabel =
    connectionState === 'connected'
      ? 'Live'
      : connectionState === 'connecting'
        ? 'Connecting…'
        : 'Offline'

  const connectionTone =
    connectionState === 'connected'
      ? 'border-white/[0.06] bg-white/[0.02] text-[var(--dash-text-secondary)]'
      : connectionState === 'connecting'
        ? 'border-[color-mix(in_srgb,var(--dash-accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--dash-accent)_10%,var(--dash-surface-raised))] text-[var(--dash-accent)]'
        : 'border-[color-mix(in_srgb,#FF525240%,transparent)] bg-[color-mix(in_srgb,#FF525212%,var(--dash-surface-raised))] text-[#FFAB91]'

  const dotTone =
    connectionState === 'connected'
      ? 'bg-[var(--dash-text-secondary)]'
      : connectionState === 'connecting'
        ? 'animate-pulse bg-[var(--dash-accent)]'
        : 'bg-[#FF5252]'

  const criticalCount = telemetry.hazards.filter((hazard) => hazard.severity === 'critical').length

  const [leftWidth, setLeftWidth] = useState(LEFT_DEFAULT)
  const [rightWidth, setRightWidth] = useState(RIGHT_DEFAULT)
  const draggingRef = useRef<'left' | 'right' | null>(null)
  const startXRef = useRef(0)
  const startWidthRef = useRef(0)

  const onHandleMouseDown = useCallback((side: 'left' | 'right', e: React.MouseEvent) => {
    e.preventDefault()
    draggingRef.current = side
    startXRef.current = e.clientX
    startWidthRef.current = side === 'left' ? leftWidth : rightWidth

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startXRef.current
      if (draggingRef.current === 'left') {
        setLeftWidth(Math.min(SIDE_MAX, Math.max(SIDE_MIN, startWidthRef.current + delta)))
      } else {
        setRightWidth(Math.min(SIDE_MAX, Math.max(SIDE_MIN, startWidthRef.current - delta)))
      }
    }
    const onUp = () => {
      draggingRef.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [leftWidth, rightWidth])

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#0a0d10] text-gray-300">
      <header className="relative flex h-12 shrink-0 items-center border-b border-white/[0.08] bg-black/50 px-4 backdrop-blur-md">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/20 to-transparent" />
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <p className="dash-label shrink-0 tracking-[0.18em] text-[color-mix(in_srgb,var(--dash-accent)_85%,var(--dash-text-secondary))]">
            D/SPATCH
          </p>
          <span className="h-3 w-px shrink-0 bg-white/15" />
          <p className="min-w-0 truncate text-sm font-semibold text-[var(--dash-text-primary)]">
            Body-cam command cockpit · Session{' '}
            <span className="font-data tabular-nums text-[var(--dash-text-secondary)]">{telemetry.session.id}</span>
          </p>
        </div>
        <div className="mr-3 hidden items-center gap-2 lg:flex">
          <span
            className={cn(
              'rounded-full border px-2.5 py-1 font-data text-[10px] font-semibold uppercase tracking-[0.14em]',
              criticalCount > 0
                ? 'border-red-400/45 bg-red-950/35 text-red-100 drop-shadow-[0_0_6px_rgba(255,23,68,0.25)]'
                : 'border-white/10 bg-white/[0.03] text-[var(--dash-text-secondary)]',
            )}
          >
            {criticalCount > 0 ? `${criticalCount} critical` : 'no critical'}
          </span>
          <span className="rounded-full border border-white/[0.06] bg-white/[0.02] px-2.5 py-1 font-data text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--dash-text-secondary)]">
            {telemetry.video.streamStatus}
          </span>
          <span className="font-data text-[10px] font-semibold tabular-nums text-[var(--dash-text-secondary)]">
            WS RTT{' '}
            <span className="text-[var(--dash-text-primary)]">{wsLatencyMs !== null ? `${wsLatencyMs}` : '—'} ms</span>
          </span>
        </div>
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-2 rounded-full border font-data text-[10px] font-semibold uppercase',
            connectionState === 'connected'
              ? 'border-white/[0.06] bg-white/[0.02] px-2.5 py-1 tracking-[0.14em] text-[var(--dash-text-secondary)]'
              : 'px-3 py-1 tracking-[0.14em]',
            connectionTone,
          )}
          role="status"
          aria-live="polite"
        >
          <span className={cn('size-1.5 shrink-0 rounded-full', dotTone)} aria-hidden />
          Telemetry · {connectionLabel}
        </span>
      </header>

      <div className="flex flex-1 flex-row overflow-hidden">
        {/* Left panel — Situations / vitals */}
        <aside
          className="flex shrink-0 flex-col gap-3 overflow-y-auto border-r border-white/[0.08] p-3"
          style={{ width: leftWidth }}
        >
          <div className="flex items-center justify-between px-1">
            <p className="dash-label tracking-[0.14em]">Situations / vitals</p>
            <span className="font-data text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--dash-text-secondary)]">
              triage stack
            </span>
          </div>
          <div className="dash-card shrink-0 p-3">
            <HazardList hazards={telemetry.hazards} />
          </div>
          <CallerLocationMapPanel
            compact
            location={telemetry.caller_location}
            onRefreshLocation={requestCallerLocationRefresh}
            wsConnected={connectionState === 'connected'}
          />
          <VitalsTelemetryCards
            patient={telemetry.patient_heart}
            respiratory={telemetry.respiratory}
            cprGuidance={telemetry.cpr_guidance}
            onCprGuidance={setCprGuidance}
            wsConnected={connectionState === 'connected'}
            telemetryCueRevision={Math.floor(Date.parse(telemetry.updatedAt) / 1000) || 0}
          />
          <SystemAlertsPanel alerts={telemetry.systemAlerts} />
          <DispatchPanel hazards={telemetry.hazards} cprActive={telemetry.cpr_guidance.active} />
        </aside>

        {/* Left drag handle */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize left panel"
          onMouseDown={(e) => onHandleMouseDown('left', e)}
          className="group relative w-1.5 shrink-0 cursor-col-resize bg-white/[0.03] transition-colors hover:bg-[color-mix(in_srgb,var(--dash-accent)_35%,transparent)] active:bg-[color-mix(in_srgb,var(--dash-accent)_55%,transparent)]"
        >
          <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/[0.08] transition-colors group-hover:bg-cyan-400/40" />
        </div>

        {/* Centre panel — Video feed */}
        <section className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(0,229,255,0.10),transparent_55%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] opacity-60" />
          <div className="relative flex min-h-0 flex-1 flex-col p-2 pt-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06),inset_0_18px_48px_rgba(0,0,0,0.55)]">
            <div className="pointer-events-none absolute left-4 top-4 z-30 max-w-[min(36rem,calc(100%-2rem))] overflow-hidden rounded-lg border border-white/[0.09] bg-black/60 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_20px_52px_rgba(0,0,0,0.55)] backdrop-blur-md">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/35 to-transparent" />
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <p className="dash-label tracking-[0.16em] text-cyan-100/70">Scene intelligence</p>
                <span className="font-data text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--dash-text-secondary)]">
                  {telemetry.caller_location.label}
                </span>
              </div>
              <p className="mt-1 truncate text-sm font-semibold text-[var(--dash-text-primary)]">
                {telemetry.hazards[0]?.description || 'Live caller POV and fused location telemetry active.'}
              </p>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-white/10 bg-black/30 shadow-[0_22px_70px_rgba(0,0,0,0.5)]">
              <VideoPlayer
                fillHeight
                streamUrl={telemetry.video.streamUrl}
                posterUrl={telemetry.video.posterUrl}
                streamStatus={telemetry.video.streamStatus}
                wsLatencyMs={wsLatencyMs}
              />
            </div>
          </div>
        </section>

        {/* Right drag handle */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize right panel"
          onMouseDown={(e) => onHandleMouseDown('right', e)}
          className="group relative w-1.5 shrink-0 cursor-col-resize bg-white/[0.03] transition-colors hover:bg-[color-mix(in_srgb,var(--dash-accent)_35%,transparent)] active:bg-[color-mix(in_srgb,var(--dash-accent)_55%,transparent)]"
        >
          <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/[0.08] transition-colors group-hover:bg-cyan-400/40" />
        </div>

        {/* Right panel — AI intelligence / transcript */}
        <aside
          className="flex shrink-0 flex-col gap-3 overflow-y-auto border-l border-white/[0.08] p-3"
          style={{ width: rightWidth }}
        >
          <div className="flex items-center justify-between px-1">
            <p className="dash-label tracking-[0.14em]">AI intelligence</p>
            <span className="font-data text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--dash-text-secondary)]">
              transcript
            </span>
          </div>
          <DeployVideoCallPanel />
          <TranscriptSummary
            chunks={telemetry.transcript}
            requestRollingSummary={requestRollingSummary}
            subscribeRollingSummary={subscribeRollingSummary}
            wsConnected={connectionState === 'connected'}
          />
        </aside>
      </div>
    </div>
  )
}
