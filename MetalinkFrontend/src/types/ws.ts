/** Shapes emitted by FastAPI `WebSocketEvent` (JSON uses snake_case). */

export type BackendEventType =
  | 'telemetry.update'
  | 'alert.critical'
  | 'pipeline.status'
  | 'heartbeat'

export interface WsEnvelope {
  schema_version: string
  event_type: BackendEventType
  timestamp: string
  payload: unknown
}

export interface BackendDetectedItem {
  item: string
  confidence: number
}

export interface BackendRespRateEstimate {
  value: number | null
  method: string
  confidence: number
}

export interface BackendCriticalAlert {
  id: string
  severity: 'info' | 'warning' | 'critical'
  title: string
  message: string
  confidence: number
  source: string
}

export interface BackendTelemetryUpdatePayload {
  timestamp?: string
  scene_hazards: BackendDetectedItem[]
  substances: BackendDetectedItem[]
  patient_position: string
  cyanosis_flag: { detected: boolean; confidence: number }
  resp_rate_estimate: BackendRespRateEstimate
  consciousness_level: string
  transcript_snippet: string
  pipeline_status: 'mock' | 'degraded' | 'live'
  critical_alerts: BackendCriticalAlert[]
}

export interface BackendHeartbeatPayload {
  pipeline_status: 'mock' | 'degraded' | 'live'
  connected_clients: number
}

export interface BackendPipelineStatusPayload {
  pipeline_status: 'mock' | 'degraded' | 'live'
  message: string
  mock_ai: boolean
  connected_clients: number
}
