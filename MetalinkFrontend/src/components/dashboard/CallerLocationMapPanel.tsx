import { useEffect, useMemo, useRef, useState } from 'react'
import { Circle, GoogleMap, Marker, useJsApiLoader } from '@react-google-maps/api'
import { cn } from '@/lib/utils'
import type { CallerLocationTelemetry } from '@/types/dashboard'

const MAP_CONTAINER_STYLE: { width: string; height: string } = { width: '100%', height: '100%' }

interface CallerLocationMapPanelProps {
  location: CallerLocationTelemetry
  wsConnected?: boolean
  onRefreshLocation?: () => void
  /** Narrow sidebar layout: shorter map chrome and fixed map height. */
  compact?: boolean
  className?: string
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

  const mapRef = useRef<google.maps.Map | null>(null)
  const [pulseR, setPulseR] = useState(52)

  useEffect(() => {
    if (!isLoaded || !mapRef.current) return
    mapRef.current.panTo(center)
  }, [center.lat, center.lng, isLoaded])

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

  const onMapLoad = (map: google.maps.Map) => {
    mapRef.current = map
    map.panTo(center)
  }

  return (
    <GoogleMap
      mapContainerStyle={MAP_CONTAINER_STYLE}
      center={center}
      zoom={16}
      onLoad={onMapLoad}
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
  wsConnected = false,
  onRefreshLocation,
  compact = false,
  className,
}: CallerLocationMapPanelProps) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const hasCoords = hasValidCoords(location)
  const mapsKey = Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim())

  const handleRefresh = () => {
    if (!onRefreshLocation) return
    setIsRefreshing(true)
    try {
      onRefreshLocation()
    } finally {
      setIsRefreshing(false)
    }
  }

  const center = useMemo<google.maps.LatLngLiteral | null>(() => {
    if (!hasCoords) return null
    return { lat: location.latitude, lng: location.longitude }
  }, [hasCoords, location.latitude, location.longitude])

  const latLabel = hasCoords ? location.latitude.toFixed(5) : '—'
  const lngLabel = hasCoords ? location.longitude.toFixed(5) : '—'

  const showRefresh = typeof onRefreshLocation === 'function'

  return (
    <section
      className={cn(
        'dash-card flex flex-col',
        compact ? 'shrink-0 p-2' : 'min-h-0 flex-1 p-3',
        className,
      )}
      aria-label="Caller location map"
    >
      <div
        className={cn(
          showRefresh && 'flex flex-wrap items-start justify-between gap-2',
          compact && 'gap-2',
        )}
      >
        <div className="min-w-0">
          <p className="dash-label tracking-[0.14em]">Caller location</p>
          <p
            className={cn(
              'mt-0.5 font-bold leading-snug text-[var(--dash-text-primary)]',
              compact ? 'line-clamp-2 text-xs' : 'mt-1 text-lg',
            )}
          >
            {location.label}
          </p>
        </div>
        {showRefresh ? (
          <button
            type="button"
            disabled={!wsConnected || isRefreshing}
            onClick={handleRefresh}
            title={wsConnected ? undefined : 'Connect to telemetry to refresh fused GPS'}
            className={cn(
              'shrink-0 rounded-md bg-[var(--dash-surface-raised)] font-semibold uppercase tracking-[0.12em] text-[var(--dash-text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-white/[0.1] hover:bg-[color-mix(in_srgb,var(--dash-surface-raised)_90%,#fff)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF] disabled:pointer-events-none disabled:opacity-45',
              compact ? 'px-2 py-1 text-[9px]' : 'px-3 py-2 text-[11px]',
            )}
          >
            {isRefreshing ? 'Refreshing…' : compact ? 'Refresh' : 'Refresh location'}
          </button>
        ) : null}
      </div>

      <div
        className={cn(
          'relative overflow-hidden rounded-lg bg-[var(--dash-bg)] ring-1 ring-white/[0.06]',
          compact ? 'mt-1.5 h-[132px]' : 'mt-2 min-h-0 flex-1',
        )}
      >
        {mapsKey && center ? (
          <GoogleMapEmbed center={center} accuracyM={location.accuracy_m} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <p className="text-sm font-medium text-[var(--dash-text-secondary)]">
              Interactive map disabled — add{' '}
              <span className="font-data text-[var(--dash-text-primary)]">VITE_GOOGLE_MAPS_API_KEY</span> to enable live
              tiles.
            </p>
          </div>
        )}

        {hasCoords ? (
          <div
            className={cn(
              'pointer-events-none absolute bottom-0 left-0 right-0 bg-[color-mix(in_srgb,var(--dash-bg)_82%,transparent)] backdrop-blur-md',
              compact ? 'px-2 py-1' : 'px-3 py-2',
            )}
          >
            <div
              className={cn(
                'flex flex-wrap items-baseline gap-x-5 gap-y-0.5 font-data font-bold tabular-nums text-[var(--dash-text-primary)]',
                compact ? 'gap-x-3 text-[10px]' : 'text-[13px]',
              )}
            >
              <span>
                <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--dash-text-secondary)]">Lat</span>
                {latLabel}
              </span>
              <span>
                <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--dash-text-secondary)]">Lng</span>
                {lngLabel}
              </span>
              {typeof location.accuracy_m === 'number' ? (
                <span className="text-[11px] font-semibold text-[var(--dash-text-secondary)]">
                  ±{Math.round(location.accuracy_m)} m
                </span>
              ) : null}
            </div>
            {typeof location.updated_at === 'string' ? (
              <p className="mt-0.5 font-data text-[10px] tabular-nums text-[var(--dash-text-secondary)]">
                Updated {new Date(location.updated_at).toLocaleTimeString()}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  )
}
