import { useTelemetryContext } from '@/context/TelemetryContext'

export function MainLayout() {
  const telemetry = useTelemetryContext()

  return (
    <main className="grid min-h-dvh grid-cols-12 grid-rows-[auto_1fr] gap-3 bg-zinc-950 p-3 text-zinc-50">
      <header className="col-span-12 rounded-md border border-zinc-800 bg-zinc-900 px-4 py-2">
        <div className="flex items-center justify-between">
          <h1 className="text-sm font-semibold tracking-wide text-cyan-300">AEGIS-LINK COMMAND</h1>
          <p className="text-xs text-zinc-400">Session {telemetry.sessionId}</p>
        </div>
      </header>

      <section className="col-span-8 rounded-md border border-zinc-800 bg-zinc-900 p-3">
        <h2 className="mb-2 text-sm font-medium text-zinc-300">Video Feed</h2>
        <div className="flex h-[70vh] items-center justify-center rounded border border-zinc-700 bg-zinc-950">
          <p className="text-sm text-zinc-400">Live feed layout zone (Phase 2 components)</p>
        </div>
      </section>

      <aside className="col-span-4 grid grid-rows-2 gap-3">
        <section className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
          <h2 className="mb-2 text-sm font-medium text-zinc-300">Hazard Telemetry</h2>
          <p className="text-xs text-zinc-400">{telemetry.hazards.length} active detections</p>
        </section>
        <section className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
          <h2 className="mb-2 text-sm font-medium text-zinc-300">Live Transcript</h2>
          <p className="text-xs text-zinc-400">{telemetry.transcript.length} transcript segments</p>
        </section>
      </aside>
    </main>
  )
}
