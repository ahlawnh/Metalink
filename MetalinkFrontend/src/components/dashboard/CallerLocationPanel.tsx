import type { CallerLocationTelemetry } from '@/types/dashboard'

interface CallerLocationPanelProps {
  location: CallerLocationTelemetry
}

export default function CallerLocationPanel({ location }: CallerLocationPanelProps) {
  const hasCoords =
    typeof location.latitude === 'number' &&
    typeof location.longitude === 'number' &&
    Number.isFinite(location.latitude) &&
    Number.isFinite(location.longitude)
  const mapsHref = hasCoords ? `https://www.google.com/maps?q=${location.latitude},${location.longitude}` : ''

  return (
    <section
      className="flex min-h-0 flex-1 flex-col rounded-xl border border-zinc-700 bg-zinc-900 p-4 shadow-md shadow-black/25"
      aria-label="Caller approximate location"
    >
      {/* Fixed minimum height consumes column slack under the fixed-aspect video without shifting other panes. */}
      <p className="text-xs uppercase tracking-widest text-zinc-400">Caller location</p>
      <p className="mt-2 text-lg font-semibold leading-snug text-zinc-100">{location.label}</p>

      <dl className="mt-4 grid flex-1 grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2">
          <dt className="text-xs uppercase tracking-wider text-zinc-500">Latitude</dt>
          <dd className="mt-1 font-mono tabular-nums text-zinc-200">
            {hasCoords ? location.latitude.toFixed(5) : '—'}
          </dd>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2">
          <dt className="text-xs uppercase tracking-wider text-zinc-500">Longitude</dt>
          <dd className="mt-1 font-mono tabular-nums text-zinc-200">
            {hasCoords ? location.longitude.toFixed(5) : '—'}
          </dd>
        </div>
        {typeof location.accuracy_m === 'number' ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-950/70 px-3 py-2 sm:col-span-2">
            <dt className="text-xs uppercase tracking-wider text-zinc-500">Estimated accuracy</dt>
            <dd className="mt-1 font-mono tabular-nums text-zinc-200">± {Math.round(location.accuracy_m)} m</dd>
          </div>
        ) : null}
      </dl>

      {typeof location.updated_at === 'string' ? (
        <p className="mt-3 text-xs tabular-nums text-zinc-500">
          Last updated {new Date(location.updated_at).toLocaleString()}
        </p>
      ) : null}

      {mapsHref ? (
        <div className="mt-4 shrink-0">
          <a
            href={mapsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-md border border-cyan-600/60 bg-cyan-950/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-cyan-100 hover:bg-cyan-900/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            Open in maps
          </a>
        </div>
      ) : (
        <p className="mt-4 shrink-0 text-xs text-zinc-500">Map link appears when latitude and longitude resolve.</p>
      )}
    </section>
  )
}
