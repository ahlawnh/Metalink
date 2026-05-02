export interface RespiratoryTelemetry {
  estimated_respiratory_rate: number
  respiratory_status: string
}

interface TelemetryPanelProps {
  telemetry: RespiratoryTelemetry
}

export default function TelemetryPanel({ telemetry }: TelemetryPanelProps) {
  const { estimated_respiratory_rate, respiratory_status } = telemetry

  return (
    <section
      className="rounded-xl border border-zinc-700 bg-zinc-900 p-5 shadow-sm shadow-black/30"
      aria-label="Respiratory telemetry panel"
    >
      <p className="text-xs uppercase tracking-widest text-zinc-400">Respiratory Rate</p>
      <div className="mt-3 flex items-end gap-3">
        <p className="text-6xl font-bold leading-none text-zinc-100">{estimated_respiratory_rate}</p>
        <p className="pb-1 text-sm uppercase tracking-wider text-zinc-400">breaths/min</p>
      </div>

      <div className="mt-6 rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2">
        <p className="text-xs uppercase tracking-widest text-zinc-400">Respiratory Status</p>
        <p className="mt-1 text-lg font-semibold text-zinc-100">{respiratory_status}</p>
      </div>
    </section>
  )
}
