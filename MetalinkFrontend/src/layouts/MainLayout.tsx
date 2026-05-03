import CallerLocationMapPanel from '@/components/dashboard/CallerLocationMapPanel'
import CprMetronomeDispatchPanel from '@/components/dashboard/CprMetronomeDispatchPanel'
import HazardList from '@/components/dashboard/HazardList'
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
    sendDispatchCpr,
    sendStopDispatchCpr,
  } = useTelemetryStream()

  const connectionTone =
    connectionState === 'connected'
      ? 'border-[color-mix(in_srgb,#00FF8840%,transparent)] bg-[color-mix(in_srgb,#00FF8812%,var(--dash-surface-raised))] text-[#9BE89E]'
      : connectionState === 'connecting'
        ? 'border-[color-mix(in_srgb,var(--dash-accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--dash-accent)_10%,var(--dash-surface-raised))] text-[var(--dash-accent)]'
        : 'border-[color-mix(in_srgb,#FF525240%,transparent)] bg-[color-mix(in_srgb,#FF525212%,var(--dash-surface-raised))] text-[#FFAB91]'

  const dotTone =
    connectionState === 'connected'
      ? 'bg-[#00FF88]'
      : connectionState === 'connecting'
        ? 'animate-pulse bg-[var(--dash-accent)]'
        : 'bg-[#FF5252]'

  return (
    <main className="grid min-h-dvh grid-cols-1 gap-6 bg-[var(--dash-bg)] p-4 text-[var(--dash-text-primary)] lg:grid-cols-2">
      {/* Half screen: body-cam POV + caller location */}
      <div className="flex min-h-0 flex-col gap-4 lg:min-h-dvh">
        <header className="dash-header-strip shrink-0 px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="dash-label text-[color-mix(in_srgb,var(--dash-accent)_85%,var(--dash-text-secondary))]">
                Live feed
              </p>
              <p className="mt-1 text-sm font-medium text-[var(--dash-text-primary)]">
                Body-cam (phone) · Session{' '}
                <span className="font-data tabular-nums font-semibold">{telemetry.session.id}</span>
              </p>
            </div>
            <span
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3 py-1 font-data text-[10px] font-semibold uppercase tracking-[0.14em]',
                connectionTone,
              )}
              role="status"
              aria-live="polite"
            >
              <span className={cn('size-2 shrink-0 rounded-full', dotTone)} aria-hidden />
              Telemetry · {connectionState}
            </span>
          </div>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="shrink-0">
            <VideoPlayer
              streamUrl={telemetry.video.streamUrl}
              posterUrl={telemetry.video.posterUrl}
              streamStatus={telemetry.video.streamStatus}
              wsLatencyMs={wsLatencyMs}
            />
          </div>
          <CallerLocationMapPanel location={telemetry.caller_location} />
        </div>
      </div>

      {/* Half screen: patient vitals + transcript */}
      <div className="flex min-h-0 flex-col gap-4 lg:min-h-dvh">
        <VitalsTelemetryCards
          patient={telemetry.patient_heart}
          respiratory={telemetry.respiratory}
          telemetryCueRevision={Math.floor(Date.parse(telemetry.updatedAt) / 1000) || 0}
        />
        <HazardList hazards={telemetry.hazards} />
        <CprMetronomeDispatchPanel
          connectionState={connectionState}
          hapticCue={telemetry.haptic_cue}
          sendDispatchCpr={sendDispatchCpr}
          sendStopDispatchCpr={sendStopDispatchCpr}
        />
        <TranscriptSummary
          chunks={telemetry.transcript}
          requestRollingSummary={requestRollingSummary}
          subscribeRollingSummary={subscribeRollingSummary}
          wsConnected={connectionState === 'connected'}
        />
      </div>
    </main>
  )
}
