export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical'

export type RespiratoryStatus = 'normal' | 'watch' | 'critical'

export interface SessionTelemetry {
  id: string
  incident_type: string
  caller_label: string
  started_at: string
}

export interface RespiratoryTelemetry {
  estimated_respiratory_rate: number
  respiratory_status: RespiratoryStatus
  confidence: number
  /** `rppg` = incident_feed / camera-linked estimates merged on the dashboard. */
  source: 'mock' | 'ai' | 'rppg'
  /** Recent BrPM samples (newest last), same role as `patient_heart.history_bpm`. */
  history_rr: number[]
}

export interface HazardTelemetry {
  id: string
  type: string
  severity: SeverityLevel
  confidence: number
  detectedAt: string
  description: string
}

export interface TranscriptChunk {
  id: string
  speaker: 'caller' | 'dispatcher' | 'ai'
  text: string
  timestamp: string
}

export interface VideoTelemetry {
  posterUrl: string | null
  streamStatus: 'connected' | 'connecting' | 'disconnected'
  /** HLS/MP4/WebRTC playback URL when pipeline provides a stream; fallback uses mock/demo clip. */
  streamUrl?: string | null
}

/** LLM recap over dual-channel STT — populated by ingest service. */
export type TranscriptAISummaryStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface TranscriptAISummaryTelemetry {
  status: TranscriptAISummaryStatus
  text: string | null
  error_detail?: string
  updated_at?: string
}

/** Vitals for the 911 operator workstation (mock until wearables integrate). */
export interface OperatorTelemetry {
  heart_rate_bpm: number
}

/** GPS / fused phone location from the bystander body-cam device (upstream pipeline). */
/** Mock / RPPG-derived cardiac disposition for the injured patient (dispatcher-facing). */
export type PatientCardiacMode =
  | 'stable'
  | 'elevated_stress'
  | 'hypoperfusion_watch'
  | 'compensatory_tachycardia'
  | 'critical_intervention'

export interface PatientHeartTelemetry {
  heart_rate_bpm: number
  mode: PatientCardiacMode
  /** Dispatcher glance string; may mirror mode or add nuance from AI pipeline. */
  dispatcher_notice: string
  signal_source: 'mock' | 'rppg' | 'unknown'
  /** Recent BPM samples newest-last for sparkline (fixed capacity on ingest). */
  history_bpm: number[]
}

export interface CallerLocationTelemetry {
  /** Human-readable place line for dispatch glance (e.g. reverse-geocoded or cross streets). */
  label: string
  latitude: number
  longitude: number
  /** Horizontal accuracy in meters, when provided. */
  accuracy_m?: number
  updated_at?: string
}

/** Dispatcher-issued cue for bystander PWA (CPR compression cadence via vibration). */
export interface HapticCueTelemetry {
  active: boolean
  pattern: 'none' | 'cpr_metronome'
  bpm: number | null
}

export interface DashboardTelemetryPayload {
  schemaVersion: string
  updatedAt: string
  session: SessionTelemetry
  respiratory: RespiratoryTelemetry
  /** Scene / vision / dispatcher alerts — not the same as pipeline health (see `systemAlerts`). */
  hazards: HazardTelemetry[]
  /** Service and pipeline status (e.g. ingest degraded); split from scene hazards in the UI. */
  systemAlerts: HazardTelemetry[]
  transcript: TranscriptChunk[]
  transcript_ai_summary: TranscriptAISummaryTelemetry
  video: VideoTelemetry
  operator: OperatorTelemetry
  caller_location: CallerLocationTelemetry
  patient_heart: PatientHeartTelemetry
  haptic_cue: HapticCueTelemetry
}
