import VideoPlayer from '@/components/dashboard/VideoPlayer'
import CallerLocationPanel from '@/components/dashboard/CallerLocationPanel'
import PatientHeartMonitor from '@/components/dashboard/PatientHeartMonitor'
import TranscriptSummary from '@/components/dashboard/TranscriptSummary'
import { useTelemetryStream } from '@/hooks/useTelemetryStream'

export function MainLayout() {
  const { telemetry, connectionState } = useTelemetryStream()

  return (
    <main className="grid min-h-dvh grid-cols-1 gap-4 bg-zinc-950 p-4 text-zinc-50 lg:grid-cols-2 lg:gap-0 lg:divide-x lg:divide-zinc-800">
      {/* Half screen: body-cam POV + caller location */}
      <div className="flex min-h-0 flex-col gap-3 lg:min-h-dvh lg:pr-4">
        <header className="shrink-0 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2">
          <p className="text-xs font-medium uppercase tracking-widest text-cyan-300">Live feed</p>
          <p className="text-sm text-zinc-300">
            Body-cam (phone) · Session {telemetry.session.id} · {connectionState}
          </p>
        </header>
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="shrink-0">
            <VideoPlayer latencyMs={42} />
          </div>
          <CallerLocationPanel location={telemetry.caller_location} />
        </div>
      </div>

      {/* Half screen: patient cardiac + transcript */}
      <div className="flex min-h-0 flex-col gap-4 lg:min-h-dvh lg:pl-4">
        <PatientHeartMonitor patient={telemetry.patient_heart} />
        <TranscriptSummary chunks={telemetry.transcript} />
      </div>
    </main>
  )
}
