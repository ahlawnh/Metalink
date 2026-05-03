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
      className="dash-card flex min-h-0 flex-1 flex-col p-4"
      aria-label="Caller approximate location"
    >
      {/* Fixed minimum height consumes column slack under the fixed-aspect video without shifting other panes. */}
      <p className="dash-label">Caller location</p>
      <p className="mt-2 text-xl font-bold leading-snug text-[var(--dash-text-primary)]">{location.label}</p>

      <dl className="mt-4 grid flex-1 grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div className="dash-inset px-3 py-2">
          <dt className="dash-label">Latitude</dt>
          <dd className="mt-1 font-data text-lg font-bold tabular-nums text-[var(--dash-text-primary)]">
            {hasCoords ? location.latitude.toFixed(5) : '—'}
          </dd>
        </div>
        <div className="dash-inset px-3 py-2">
          <dt className="dash-label">Longitude</dt>
          <dd className="mt-1 font-data text-lg font-bold tabular-nums text-[var(--dash-text-primary)]">
            {hasCoords ? location.longitude.toFixed(5) : '—'}
          </dd>
        </div>
        {typeof location.accuracy_m === 'number' ? (
          <div className="dash-inset px-3 py-2 sm:col-span-2">
            <dt className="dash-label">Estimated accuracy</dt>
            <dd className="mt-1 font-data text-lg font-bold tabular-nums text-[var(--dash-text-primary)]">
              ± {Math.round(location.accuracy_m)} m
            </dd>
          </div>
        ) : null}
      </dl>

      {typeof location.updated_at === 'string' ? (
        <p className="mt-3 font-data text-[11px] tabular-nums text-[var(--dash-text-secondary)]">
          Last updated {new Date(location.updated_at).toLocaleString()}
        </p>
      ) : null}

      {mapsHref ? (
        <div className="mt-4 shrink-0">
          <a
            href={mapsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center rounded-md bg-[color-mix(in_srgb,#18FFFF_14%,var(--dash-surface-raised))] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#80FFFF] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] ring-1 ring-[color-mix(in_srgb,#00E5FF_55%,transparent)] hover:bg-[color-mix(in_srgb,#18FFFF_22%,var(--dash-surface-raised))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
          >
            Open in maps
          </a>
        </div>
      ) : (
        <p className="mt-4 shrink-0 text-xs text-[var(--dash-text-secondary)]">
          Map link appears when latitude and longitude resolve.
        </p>
      )}
    </section>
  )
}
