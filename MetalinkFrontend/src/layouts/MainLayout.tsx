import CallerLocationMapPanel from '@/components/dashboard/CallerLocationMapPanel'
import HazardList from '@/components/dashboard/HazardList'
import SystemAlertsPanel from '@/components/dashboard/SystemAlertsPanel'
import VitalsTelemetryCards from '@/components/dashboard/VitalsTelemetryCards'
import TranscriptSummary from '@/components/dashboard/TranscriptSummary'
import VideoPlayer from '@/components/dashboard/VideoPlayer'
import { useTelemetryStream } from '@/hooks/useTelemetryStream'
import { cn } from '@/lib/utils'

export function MainLayout() {
  const {
    telemetry,
    connectionState,
    wsLatencyMs,
    requestRollingSummary,
    subscribeRollingSummary,
    setCprGuidance,
  } = useTelemetryStream()

  const connectionLabel =
    connectionState === 'connected'
      ? 'Live'
      : connectionState === 'connecting'
        ? 'Connecting…'
        : connectionState === 'error'
          ? 'Error'
          : 'Disconnected'

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#050505] text-[var(--dash-text-primary)]">
      <header className="flex items-center justify-between border-b border-[var(--dash-border)] px-6 py-4">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--dash-text-muted)]">
            Dispatch Bridge
          </p>
          <h1 className="text-2xl font-semibold">Live Telemetry</h1>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-[var(--dash-text-muted)]">
            Connection:{' '}
            <span
              className={cn(
                'font-semibold',
                connectionState === 'connected'
                  ? 'text-[#00FF88]'
                  : connectionState === 'connecting'
                    ? 'text-[#FFB74D]'
                    : 'text-[#FF1744]',
              )}
            >
              {connectionLabel}
            </span>
          </span>
          <span className="text-[var(--dash-text-muted)]">
            WS RTT:{' '}
            <span className="font-semibold text-[var(--dash-text-primary)]">
              {wsLatencyMs !== null ? `${wsLatencyMs} ms` : '—'}
            </span>
          </span>
        </div>
      </header>

      <div className="grid flex-1 grid-cols-[minmax(0,1fr)_420px] gap-6 overflow-hidden px-6 pb-6">
        <section className="flex min-h-0 flex-col gap-4 overflow-hidden">
          <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-[var(--dash-border)] bg-[var(--dash-surface)] shadow-[0_0_25px_rgba(0,255,136,0.08)]">
            <VideoPlayer video={telemetry.video} />
          </div>
          <div className="h-40 shrink-0 overflow-hidden rounded-2xl border border-[var(--dash-border)] bg-[var(--dash-surface)] p-3">
            <CallerLocationMapPanel location={telemetry.caller_location} />
          </div>
        </section>

        <aside className="flex min-h-0 flex-col gap-4 overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <div className="flex flex-col gap-4">
              <VitalsTelemetryCards
                patient={telemetry.patient_heart}
                respiratory={telemetry.respiratory}
                cprGuidance={telemetry.cpr_guidance}
                onCprGuidance={setCprGuidance}
                wsConnected={connectionState === 'connected'}
                telemetryCueRevision={Math.floor(Date.parse(telemetry.updatedAt) / 1000) || 0}
              />
              <SystemAlertsPanel alerts={telemetry.systemAlerts} />
              <HazardList hazards={telemetry.hazards} />
              <TranscriptSummary
                transcript={telemetry.transcript}
                summary={telemetry.transcript_ai_summary}
                onRequestSummary={requestRollingSummary}
                onSubscribeSummary={subscribeRollingSummary}
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
