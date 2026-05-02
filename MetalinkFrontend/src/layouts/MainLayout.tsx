import VideoPlayer from '@/components/dashboard/VideoPlayer'
import CallerLocationPanel from '@/components/dashboard/CallerLocationPanel'
import PatientHeartMonitor from '@/components/dashboard/PatientHeartMonitor'
import TranscriptSummary from '@/components/dashboard/TranscriptSummary'
import { useTelemetryStream } from '@/hooks/useTelemetryStream'

export function MainLayout() {
  const { telemetry, connectionState } = useTelemetryStream()

  return (
    <main className="grid min-h-dvh grid-cols-1 gap-6 bg-[var(--dash-bg)] p-4 text-[var(--dash-text-primary)] lg:grid-cols-2">
      {/* Half screen: body-cam POV + caller location */}
      <div className="flex min-h-0 flex-col gap-4 lg:min-h-dvh">
        <header className="dash-header-strip shrink-0 px-4 py-3">
          <p className="dash-label text-[color-mix(in_srgb,var(--dash-accent)_85%,var(--dash-text-secondary))]">
            Live feed
          </p>
          <p className="mt-1 text-sm font-medium text-[var(--dash-text-primary)]">
            Body-cam (phone) · Session{' '}
            <span className="font-data tabular-nums font-semibold">{telemetry.session.id}</span> ·{' '}
            <span className="font-data tabular-nums">{connectionState}</span>
          </p>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="shrink-0">
            <VideoPlayer latencyMs={42} />
          </div>
          <CallerLocationPanel location={telemetry.caller_location} />
        </div>
      </div>

      {/* Half screen: patient cardiac + transcript */}
      <div className="flex min-h-0 flex-col gap-4 lg:min-h-dvh">
        <PatientHeartMonitor patient={telemetry.patient_heart} />
        <TranscriptSummary chunks={telemetry.transcript} />
      </div>
    </main>
  )
}
