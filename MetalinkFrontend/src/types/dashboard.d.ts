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

/** Dispatcher-driven CPR tempo from vitals “CPR tempo” (60–140 BPM); echoed via WS `haptic_cue`. */
export interface CprGuidanceTelemetry {
  active: boolean
  bpm: number | null
}

/** Dispatcher-issued cue for bystander PWA (CPR cadence; caller plays low-frequency buzz audio). */
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
  hazards: HazardTelemetry[]
  transcript: TranscriptChunk[]
  transcript_ai_summary: TranscriptAISummaryTelemetry
  video: VideoTelemetry
  operator: OperatorTelemetry
  caller_location: CallerLocationTelemetry
  patient_heart: PatientHeartTelemetry
  /** Vitals HR panel CPR tempo UI state (mirrors backend `haptic_cue` when active). */
  cpr_guidance: CprGuidanceTelemetry
  /** Backend `haptic_cue` for dashboard parity (60–140 BPM when active). */
  haptic_cue: HapticCueTelemetry
}
