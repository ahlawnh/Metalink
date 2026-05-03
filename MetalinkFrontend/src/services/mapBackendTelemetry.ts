import type {
  BackendCriticalAlert,
  BackendTelemetryUpdatePayload,
  BackendDetectedItem,
  BackendTranscriptSegment,
} from '@/types/ws'
import type {
  DashboardTelemetryPayload,
  HazardTelemetry,
  RespiratoryStatus,
  TranscriptChunk,
} from '@/types/dashboard'

function asIsoString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function alertSeverityToHazardSeverity(
  severity: BackendCriticalAlert['severity'],
): HazardTelemetry['severity'] {
  if (severity === 'critical') return 'critical'
  if (severity === 'warning') return 'high'
  return 'low'
}

function detectedItemsToHazards(
  items: BackendDetectedItem[],
  prefix: string,
  detectedAt: string,
): HazardTelemetry[] {
  return items.map((it, index) => ({
    id: `${prefix}-${index}-${hashId(it.item)}`,
    type: it.item,
    severity: it.confidence >= 0.85 ? 'high' : 'medium',
    confidence: it.confidence,
    detectedAt,
    description: it.item,
  }))
}

function hashId(label: string): string {
  return String(Math.abs([...label].reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0)))
}

function alertsToHazards(alerts: BackendCriticalAlert[], detectedAt: string): HazardTelemetry[] {
  return alerts.map((alert) => ({
    id: alert.id,
    type: alert.title,
    severity: alertSeverityToHazardSeverity(alert.severity),
    confidence: alert.confidence,
    detectedAt,
    description: alert.message,
  }))
}

function deriveRespiratoryStatus(payload: BackendTelemetryUpdatePayload): RespiratoryStatus {
  const hasCritical = payload.critical_alerts.some((a) => a.severity === 'critical')
  const rate = payload.resp_rate_estimate?.value
  if (hasCritical) return 'critical'
  if (rate !== null && rate !== undefined && rate > 0 && rate < 12) return 'watch'
  if (payload.consciousness_level === 'unresponsive') return 'watch'
  if (payload.cyanosis_flag?.detected) return 'watch'
  return 'normal'
}

function snippetToTranscript(snippet: string, timestamp: string): TranscriptChunk[] {
  const trimmed = snippet.trim()
  if (!trimmed) return []
  return [
    {
      id: `tx-live-${hashId(trimmed)}-${hashId(timestamp)}`,
      speaker: 'caller',
      text: trimmed,
      timestamp,
    },
  ]
}

function segmentsToTranscript(segments: BackendTranscriptSegment[]): TranscriptChunk[] {
  return segments
    .filter((segment) => segment.text.trim().length > 0)
    .map((segment, index) => ({
      id: `tx-${segment.speaker}-${hashId(segment.text)}-${hashId(segment.timestamp)}-${index}`,
      speaker: segment.speaker,
      text: segment.text.trim(),
      timestamp: segment.timestamp,
    }))
}

function pipelineToVideoStatus(
  pipeline: BackendTelemetryUpdatePayload['pipeline_status'],
): DashboardTelemetryPayload['video']['streamStatus'] {
  if (pipeline === 'degraded') return 'connecting'
  return 'connected'
}

/** Merge a backend telemetry snapshot into the dashboard contract; keeps session from previous. */
export function applyTelemetryUpdate(
  previous: DashboardTelemetryPayload,
  rawPayload: unknown,
  envelopeTimestamp: string,
): DashboardTelemetryPayload {
  const payload = (rawPayload ?? {}) as Partial<BackendTelemetryUpdatePayload>
  const now = asIsoString(payload.timestamp, envelopeTimestamp)

  const scene = detectedItemsToHazards(payload.scene_hazards ?? [], 'scene', now)
  const subs = detectedItemsToHazards(payload.substances ?? [], 'substance', now)
  const fromAlerts = alertsToHazards(payload.critical_alerts ?? [], now)

  const hazardById = new Map<string, HazardTelemetry>()
  for (const h of [...fromAlerts, ...scene, ...subs]) {
    hazardById.set(h.id, h)
  }
  const hazards = [...hazardById.values()]

  const rate = payload.resp_rate_estimate?.value ?? 0
  const pipelineStatus = payload.pipeline_status ?? 'mock'
  const fullPayload: BackendTelemetryUpdatePayload = {
    timestamp: payload.timestamp,
    scene_hazards: payload.scene_hazards ?? [],
    substances: payload.substances ?? [],
    patient_position: payload.patient_position ?? 'unknown',
    cyanosis_flag: payload.cyanosis_flag ?? { detected: false, confidence: 0 },
    resp_rate_estimate: payload.resp_rate_estimate ?? { value: null, method: 'unknown', confidence: 0 },
    consciousness_level: payload.consciousness_level ?? 'unknown',
    transcript_snippet: payload.transcript_snippet ?? '',
    transcript_segments: payload.transcript_segments,
    pipeline_status: pipelineStatus,
    critical_alerts: payload.critical_alerts ?? [],
  }
  const respiratoryStatus = deriveRespiratoryStatus(fullPayload)

  const segmentChunks = Array.isArray(payload.transcript_segments)
    ? segmentsToTranscript(payload.transcript_segments)
    : []
  const snippetChunks = snippetToTranscript(fullPayload.transcript_snippet, now)
  const transcript =
    segmentChunks.length > 0
      ? segmentChunks
      : snippetChunks.length > 0
        ? snippetChunks
        : previous.transcript

  const loc = payload.caller_location
  const caller_location =
    loc && typeof loc.latitude === 'number' && typeof loc.longitude === 'number'
      ? {
          label: typeof loc.label === 'string' && loc.label.length > 0 ? loc.label : previous.caller_location.label,
          latitude: loc.latitude,
          longitude: loc.longitude,
          accuracy_m: typeof loc.accuracy_m === 'number' ? loc.accuracy_m : previous.caller_location.accuracy_m,
          updated_at: typeof loc.updated_at === 'string' ? loc.updated_at : now,
        }
      : previous.caller_location

  return {
    ...previous,
    updatedAt: now,
    caller_location,
    respiratory: {
      estimated_respiratory_rate: typeof rate === 'number' && !Number.isNaN(rate) ? rate : 0,
      respiratory_status: respiratoryStatus,
      confidence: Number(payload.resp_rate_estimate?.confidence ?? 0),
      source: pipelineStatus === 'live' ? 'ai' : 'mock',
    },
    hazards,
    transcript,
    video: {
      ...previous.video,
      streamStatus: pipelineToVideoStatus(pipelineStatus),
    },
  }
}

export function applyCriticalAlertEvent(
  previous: DashboardTelemetryPayload,
  rawPayload: unknown,
  envelopeTimestamp: string,
): DashboardTelemetryPayload {
  const alert = rawPayload as BackendCriticalAlert
  const detectedAt = envelopeTimestamp
  const hazard: HazardTelemetry = {
    id: alert.id,
    type: alert.title,
    severity: alertSeverityToHazardSeverity(alert.severity),
    confidence: alert.confidence,
    detectedAt,
    description: alert.message,
  }

  const withoutDup = previous.hazards.filter((h) => h.id !== hazard.id)
  return {
    ...previous,
    updatedAt: detectedAt,
    hazards: [hazard, ...withoutDup],
    respiratory:
      alert.severity === 'critical'
        ? { ...previous.respiratory, respiratory_status: 'critical' }
        : previous.respiratory,
  }
}

export function applyHeartbeat(
  previous: DashboardTelemetryPayload,
  connectedClients: number,
  envelopeTimestamp: string,
): DashboardTelemetryPayload {
  // Bounded synthetic operator load from fan-out count — stable UX, no backend vitals yet.
  const bpm = Math.min(110, 68 + connectedClients * 6)
  return {
    ...previous,
    updatedAt: envelopeTimestamp,
    operator: { heart_rate_bpm: bpm },
  }
}

export function applyPipelineStatus(
  previous: DashboardTelemetryPayload,
  pipelineStatus: 'mock' | 'degraded' | 'live',
  envelopeTimestamp: string,
): DashboardTelemetryPayload {
  return {
    ...previous,
    updatedAt: envelopeTimestamp,
    video: {
      ...previous.video,
      streamStatus: pipelineStatus === 'degraded' ? 'connecting' : 'connected',
    },
    respiratory: {
      ...previous.respiratory,
      source: pipelineStatus === 'live' ? 'ai' : 'mock',
    },
  }
}
