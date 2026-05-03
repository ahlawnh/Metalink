import { useEffect, useMemo, useRef, useState } from 'react'
import { Circle, GoogleMap, Marker, useJsApiLoader } from '@react-google-maps/api'
import type { CallerLocationTelemetry } from '@/types/dashboard'

const MAP_CONTAINER_STYLE: { width: string; height: string } = { width: '100%', height: '100%' }

interface CallerLocationMapPanelProps {
  location: CallerLocationTelemetry
  onRefreshLocation: () => void
  wsConnected: boolean
}

function hasValidCoords(location: CallerLocationTelemetry): boolean {
  return (
    typeof location.latitude === 'number' &&
    typeof location.longitude === 'number' &&
    Number.isFinite(location.latitude) &&
    Number.isFinite(location.longitude)
  )
}

interface MapEmbedProps {
  center: google.maps.LatLngLiteral
  accuracyM?: number
}

function GoogleMapEmbed({ center, accuracyM }: MapEmbedProps) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() ?? ''
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'metalink-google-map-script',
    googleMapsApiKey: apiKey || '__MISSING__',
  })

  const [pulseR, setPulseR] = useState(52)

  useEffect(() => {
    if (!isLoaded) return
    const id = window.setInterval(() => setPulseR((r) => (r < 54 ? 78 : 48)), 760)
    return () => window.clearInterval(id)
  }, [isLoaded])

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
        <p className="text-sm font-medium text-[#FFAB91]">Map failed to load</p>
        <p className="text-xs text-[var(--dash-text-secondary)]">Check API key restrictions and billing for Maps JavaScript.</p>
      </div>
    )
  }

  if (!isLoaded) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="font-data text-xs uppercase tracking-[0.14em] text-[var(--dash-text-secondary)]">Loading map…</p>
      </div>
    )
  }

  const g = window.google.maps
  const pingIcon: google.maps.Icon = {
    url:
      'data:image/svg+xml,' +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44"><circle cx="22" cy="22" r="18" fill="none" stroke="%2300E5FF" stroke-width="2" opacity="0.4"/><circle cx="22" cy="22" r="9" fill="%2300E5FF" stroke="%23ffffff" stroke-width="2"/></svg>`,
      ),
    scaledSize: new g.Size(44, 44),
    anchor: new g.Point(22, 22),
  }

  return (
    <GoogleMap
      mapContainerStyle={MAP_CONTAINER_STYLE}
      center={center}
      zoom={16}
      options={{
        fullscreenControl: false,
        streetViewControl: false,
        mapTypeControl: false,
        gestureHandling: 'greedy',
      }}
    >
      <Circle
        center={center}
        radius={pulseR}
        options={{
          strokeColor: '#00E5FF',
          strokeOpacity: 0.5,
          strokeWeight: 1,
          fillColor: '#00E5FF',
          fillOpacity: 0.07,
        }}
      />
      {typeof accuracyM === 'number' && accuracyM > 0 ? (
        <Circle
          center={center}
          radius={accuracyM}
          options={{
            strokeColor: '#E0E0E0',
            strokeOpacity: 0.35,
            strokeWeight: 1,
            fillColor: '#E0E0E0',
            fillOpacity: 0.05,
          }}
        />
      ) : null}
      <Marker position={center} icon={pingIcon} />
    </GoogleMap>
  )
}

export default function CallerLocationMapPanel({
  location,
  onRefreshLocation,
  wsConnected,
}: CallerLocationMapPanelProps) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const lastUpdatedRef = useRef(location.updated_at)

  const hasCoords = hasValidCoords(location)
  const mapsKey = Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim())

  const center = useMemo<google.maps.LatLngLiteral | null>(() => {
    if (!hasCoords) return null
    return { lat: location.latitude, lng: location.longitude }
  }, [hasCoords, location.latitude, location.longitude])

  const latLabel = hasCoords ? location.latitude.toFixed(5) : '—'
  const lngLabel = hasCoords ? location.longitude.toFixed(5) : '—'

  useEffect(() => {
    if (!isRefreshing) {
      lastUpdatedRef.current = location.updated_at
      return
    }
    if (location.updated_at !== lastUpdatedRef.current) {
      setIsRefreshing(false)
      lastUpdatedRef.current = location.updated_at
    }
  }, [location.updated_at, isRefreshing])

  useEffect(() => {
    if (!isRefreshing) return
    const id = window.setTimeout(() => setIsRefreshing(false), 8000)
    return () => window.clearTimeout(id)
  }, [isRefreshing])

  const handleRefresh = () => {
    if (!wsConnected || isRefreshing) return
    setIsRefreshing(true)
    onRefreshLocation()
  }

  return (
    <section className="dash-card flex min-h-0 flex-1 flex-col p-4" aria-label="Caller location map">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="dash-label">Caller location</p>
          <p className="mt-2 text-xl font-bold leading-snug text-[var(--dash-text-primary)]">{location.label}</p>
        </div>
        <button
          type="button"
          disabled={!wsConnected || isRefreshing}
          onClick={handleRefresh}
          title={wsConnected ? undefined : 'Connect to telemetry to refresh fused GPS'}
          className="rounded-md bg-[var(--dash-surface-raised)] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--dash-text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-white/[0.1] hover:bg-[color-mix(in_srgb,var(--dash-surface-raised)_90%,#fff)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF] disabled:pointer-events-none disabled:opacity-45"
        >
          {isRefreshing ? 'Refreshing…' : 'Refresh location'}
        </button>
      </div>

      <div className="relative mt-4 min-h-[220px] flex-1 overflow-hidden rounded-lg bg-[var(--dash-bg)] ring-1 ring-white/[0.06] md:min-h-[280px]">
        {mapsKey && center ? (
          <GoogleMapEmbed center={center} accuracyM={location.accuracy_m} />
        ) : (
          <div className="flex h-full min-h-[220px] flex-col items-center justify-center gap-2 px-4 text-center md:min-h-[280px]">
            <p className="text-sm font-medium text-[var(--dash-text-secondary)]">
              Interactive map disabled — add{' '}
              <span className="font-data text-[var(--dash-text-primary)]">VITE_GOOGLE_MAPS_API_KEY</span> to enable live
              tiles.
            </p>
          </div>
        )}

        {hasCoords ? (
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 bg-[color-mix(in_srgb,var(--dash-bg)_78%,transparent)] px-3 py-2 backdrop-blur-md">
            <div className="flex flex-wrap gap-x-6 gap-y-1 font-data text-[13px] font-bold tabular-nums text-[var(--dash-text-primary)]">
              <span>
                <span className="mr-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--dash-text-secondary)]">
                  Lat
                </span>
                {latLabel}
              </span>
              <span>
                <span className="mr-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--dash-text-secondary)]">
                  Lng
                </span>
                {lngLabel}
              </span>
            </div>
          </div>
        ) : null}
      </div>

      <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div className="dash-inset px-3 py-2">
          <dt className="dash-label">Latitude</dt>
          <dd className="mt-1 font-data text-lg font-bold tabular-nums text-[var(--dash-text-primary)]">{latLabel}</dd>
        </div>
        <div className="dash-inset px-3 py-2">
          <dt className="dash-label">Longitude</dt>
          <dd className="mt-1 font-data text-lg font-bold tabular-nums text-[var(--dash-text-primary)]">{lngLabel}</dd>
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
    </section>
  )
}
