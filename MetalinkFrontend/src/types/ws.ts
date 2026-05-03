/** Shapes emitted by FastAPI `WebSocketEvent` (JSON uses snake_case). */

export type BackendEventType =
  | 'telemetry.update'
  | 'telemetry.summary_updated'
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

export interface BackendCallerLocationSnapshot {
  label?: string
  latitude: number
  longitude: number
  accuracy_m?: number
  updated_at?: string
}

/** Camera-derived HR from incident_feed (backend `TelemetryUpdate.heart_rate_rppg`). */
export interface BackendHeartRateRppg {
  value: number | null
  confidence: number
  disclaimer?: string
}

export interface BackendTranscriptSegment {
  speaker: 'caller' | 'dispatcher'
  text: string
  timestamp: string
  is_final?: boolean
  confidence?: number
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
  transcript_segments?: BackendTranscriptSegment[]
  pipeline_status: 'mock' | 'degraded' | 'live'
  critical_alerts: BackendCriticalAlert[]
  /** When present, replaces dashboard caller map pin (e.g. after `request.caller_location`). */
  caller_location?: BackendCallerLocationSnapshot
  /** When present, updates patient cardiac strip from incident_feed rPPG. */
  heart_rate_rppg?: BackendHeartRateRppg | null
  /** When true, dispatcher clears call transcript and AI summary (bystander ended session). */
  clear_transcript?: boolean
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
