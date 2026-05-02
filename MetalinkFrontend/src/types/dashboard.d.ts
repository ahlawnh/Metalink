export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical'

export interface VitalSigns {
  respiratoryRate?: number
  heartRate?: number
  oxygenSaturation?: number
  temperatureC?: number
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
}

export interface DashboardTelemetryPayload {
  schemaVersion: string
  sessionId: string
  updatedAt: string
  vitals: VitalSigns
  hazards: HazardTelemetry[]
  transcript: TranscriptChunk[]
  video: VideoTelemetry
}
