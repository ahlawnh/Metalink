import { useEffect, useMemo, useRef, useState } from 'react'
import fallbackTelemetry from '@/data/telemetry.json'
import {
  applyCriticalAlertEvent,
  applyHeartbeat,
  applyPipelineStatus,
  applyTelemetryUpdate,
} from '@/services/mapBackendTelemetry'
import { normalizeTelemetryPayload } from '@/services/telemetry'
import type { DashboardTelemetryPayload } from '@/types/dashboard'
import type { WsEnvelope } from '@/types/ws'

export type TelemetryConnectionState = 'connecting' | 'connected' | 'fallback'

const RECONNECT_MS = 3000

const DEFAULT_FALLBACK_WS = 'ws://127.0.0.1:8000/api/ws/telemetry'

function buildWsUrl(): string {
  try {
    const override = import.meta.env.VITE_TELEMETRY_WS_URL
    if (typeof override === 'string' && override.length > 0) {
      return override
    }
    const origin =
      (import.meta.env.VITE_TELEMETRY_API_ORIGIN as string | undefined)?.trim() || 'http://127.0.0.1:8000'
    const u = new URL(origin)
    const wsProto = u.protocol === 'https:' ? 'wss:' : 'ws:'
    const scenario = import.meta.env.VITE_TELEMETRY_SCENARIO as string | undefined
    const wsPath = `/api/ws/telemetry${scenario ? `?scenario=${encodeURIComponent(scenario)}` : ''}`
    return `${wsProto}//${u.host}${wsPath}`
  } catch {
    // Bad VITE_* URL must not blank-screen the SPA; telemetry still renders from mock JSON.
    return DEFAULT_FALLBACK_WS
  }
}

function isEnvelope(value: unknown): value is WsEnvelope {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return typeof v.event_type === 'string' && typeof v.schema_version === 'string'
}

export function useTelemetryStream(): {
  telemetry: DashboardTelemetryPayload
  connectionState: TelemetryConnectionState
} {
  const initial = useMemo(() => normalizeTelemetryPayload(fallbackTelemetry), [])
  const [telemetry, setTelemetry] = useState<DashboardTelemetryPayload>(initial)
  const [connectionState, setConnectionState] = useState<TelemetryConnectionState>('connecting')
  const wsUrl = useMemo(() => buildWsUrl(), [])
  const socketRef = useRef<WebSocket | null>(null)
  const reconnectRef = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false

    const clearReconnect = () => {
      if (reconnectRef.current !== null) {
        window.clearTimeout(reconnectRef.current)
        reconnectRef.current = null
      }
    }

    const scheduleReconnect = () => {
      clearReconnect()
      reconnectRef.current = window.setTimeout(() => {
        if (!cancelled) {
          connect()
        }
      }, RECONNECT_MS)
    }

    const connect = () => {
      setConnectionState('connecting')
      clearReconnect()
      const socket = new WebSocket(wsUrl)
      socketRef.current = socket

      socket.onopen = () => {
        if (cancelled) return
        setConnectionState('connected')
      }

      socket.onmessage = (event) => {
        if (cancelled) return
        try {
          const data = JSON.parse(event.data) as unknown
          if (!isEnvelope(data)) {
            return
          }

          setTelemetry((prev) => {
            switch (data.event_type) {
              case 'telemetry.update':
                return applyTelemetryUpdate(prev, data.payload, data.timestamp)
              case 'alert.critical':
                return applyCriticalAlertEvent(prev, data.payload, data.timestamp)
              case 'heartbeat': {
                const p = data.payload as { connected_clients?: number }
                return applyHeartbeat(prev, Number(p.connected_clients ?? 0), data.timestamp)
              }
              case 'pipeline.status': {
                const p = data.payload as { pipeline_status?: 'mock' | 'degraded' | 'live' }
                const ps = p.pipeline_status ?? 'mock'
                return applyPipelineStatus(prev, ps, data.timestamp)
              }
              default:
                return prev
            }
          })
        } catch {
          setConnectionState('fallback')
        }
      }

      socket.onerror = () => {
        if (cancelled) return
        setConnectionState('fallback')
      }

      socket.onclose = () => {
        if (cancelled) return
        setConnectionState('fallback')
        scheduleReconnect()
      }
    }

    connect()

    return () => {
      cancelled = true
      clearReconnect()
      socketRef.current?.close()
      socketRef.current = null
    }
  }, [wsUrl, initial])

  return { telemetry, connectionState }
}
