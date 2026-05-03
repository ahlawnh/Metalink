import type {
  BackendCriticalAlert,
  BackendDetectedItem,
  BackendHapticCue,
  BackendTelemetryUpdatePayload,
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

function segmentTimestampIso(segment: BackendTranscriptSegment, fallback: string): string {
  const t = segment.timestamp as unknown
  if (typeof t === 'string' && t.length > 0) return t
  if (typeof t === 'number' && Number.isFinite(t)) return new Date(t).toISOString()
  return fallback
}

function segmentsToTranscript(segments: BackendTranscriptSegment[], fallbackTime: string): TranscriptChunk[] {
  return segments
    .filter((segment) => segment.text.trim().length > 0)
    .map((segment, index) => ({
      id: `tx-${segment.speaker}-${hashId(segment.text)}-${hashId(String(segment.timestamp))}-${index}`,
      speaker: segment.speaker,
      text: segment.text.trim(),
      timestamp: segmentTimestampIso(segment, fallbackTime),
    }))
}

/** When only `transcript_snippet` updates: append deltas so oldest stays top, newest bottom. */
function mergeTranscriptRolling(previous: TranscriptChunk[], snippet: string, now: string): TranscriptChunk[] {
  const trimmed = snippet.trim()
  if (!trimmed) return previous

  const prevJoined = previous
    .map((c) => c.text)
    .join(' ')
    .trim()
  if (trimmed === prevJoined) return previous

  if (prevJoined && trimmed.startsWith(prevJoined)) {
    const delta = trimmed.slice(prevJoined.length).trim()
    if (!delta) return previous
    return [
      ...previous,
      {
        id: `tx-live-${hashId(delta)}-${hashId(now)}`,
        speaker: 'caller',
        text: delta,
        timestamp: now,
      },
    ]
  }

  return snippetToTranscript(trimmed, now)
}

function pipelineToVideoStatus(
  pipeline: BackendTelemetryUpdatePayload['pipeline_status'],
): DashboardTelemetryPayload['video']['streamStatus'] {
  if (pipeline === 'degraded') return 'connecting'
  return 'connected'
}

function mergeHapticCue(
  previous: DashboardTelemetryPayload['haptic_cue'],
  rawPayload: unknown,
): DashboardTelemetryPayload['haptic_cue'] {
  const envelope = rawPayload as Record<string, unknown>
  if (!('haptic_cue' in envelope)) {
    return previous
  }
  const hc = envelope.haptic_cue as BackendHapticCue | null | undefined
  // Routine ingest emits explicit null — keep dispatcher CPR state until an object clears it.
  if (hc === null || hc === undefined) {
    return previous
  }
  if (typeof hc !== 'object') {
    return previous
  }
  if (hc.active === true && hc.pattern === 'cpr_metronome') {
    const rawBpm = hc.bpm
    const bpm =
      typeof rawBpm === 'number' && Number.isFinite(rawBpm)
        ? Math.min(140, Math.max(60, Math.round(rawBpm)))
        : 110
    return { active: true, pattern: 'cpr_metronome', bpm }
  }
  return { active: false, pattern: 'none', bpm: null }
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

  const criticalRaw = payload.critical_alerts ?? []
  const sceneRelatedAlerts = criticalRaw.filter((a) => a.source !== 'system')
  const systemAlertsRaw = criticalRaw.filter((a) => a.source === 'system')
  const fromSceneAlerts = alertsToHazards(sceneRelatedAlerts, now)
  const fromSystemAlerts = alertsToHazards(systemAlertsRaw, now)

  const hazardById = new Map<string, HazardTelemetry>()
  for (const h of [...fromSceneAlerts, ...scene, ...subs]) {
    hazardById.set(h.id, h)
  }

  const systemById = new Map<string, HazardTelemetry>()
  for (const h of fromSystemAlerts) {
    systemById.set(h.id, h)
  }

  /** incident_feed batches are LIVE with empty hazard lists — keep existing hazards from vision/mock. */
  const isIncidentPatch =
    payload.pipeline_status === 'live' &&
    (payload.scene_hazards?.length ?? 0) === 0 &&
    (payload.substances?.length ?? 0) === 0 &&
    (payload.critical_alerts?.length ?? 0) === 0

  const hazards = isIncidentPatch ? previous.hazards : [...hazardById.values()]
  const systemAlerts = isIncidentPatch ? previous.systemAlerts : [...systemById.values()]

  const rawRate = payload.resp_rate_estimate?.value
  const keepResp =
    isIncidentPatch &&
    (rawRate === null || rawRate === undefined || Number(rawRate) === 0)
  const mergedRate = keepResp
    ? previous.respiratory.estimated_respiratory_rate
    : typeof rawRate === 'number' && !Number.isNaN(rawRate)
      ? rawRate
      : 0

  const pipelineStatus = payload.pipeline_status ?? 'mock'
  const baseResp = payload.resp_rate_estimate ?? { value: null, method: 'unknown', confidence: 0 }
  const fullPayload: BackendTelemetryUpdatePayload = {
    timestamp: payload.timestamp,
    scene_hazards: payload.scene_hazards ?? [],
    substances: payload.substances ?? [],
    patient_position: payload.patient_position ?? 'unknown',
    cyanosis_flag: payload.cyanosis_flag ?? { detected: false, confidence: 0 },
    resp_rate_estimate: {
      ...baseResp,
      value: mergedRate > 0 ? mergedRate : null,
    },
    consciousness_level: payload.consciousness_level ?? 'unknown',
    transcript_snippet: payload.transcript_snippet ?? '',
    transcript_segments: payload.transcript_segments,
    pipeline_status: pipelineStatus,
    critical_alerts: payload.critical_alerts ?? [],
  }
  const respiratoryStatus = deriveRespiratoryStatus(fullPayload)

  const prevHist = previous.respiratory.history_rr?.length
    ? [...previous.respiratory.history_rr]
    : typeof previous.respiratory.estimated_respiratory_rate === 'number' &&
        Number.isFinite(previous.respiratory.estimated_respiratory_rate) &&
        previous.respiratory.estimated_respiratory_rate > 0
      ? [previous.respiratory.estimated_respiratory_rate]
      : []
  const history_rr = keepResp
    ? previous.respiratory.history_rr ?? []
    : typeof mergedRate === 'number' && Number.isFinite(mergedRate) && mergedRate > 0
      ? [...prevHist, mergedRate].slice(-32)
      : prevHist

  const segmentChunks = Array.isArray(payload.transcript_segments)
    ? segmentsToTranscript(payload.transcript_segments, now)
    : []
  const transcript = payload.clear_transcript
    ? []
    : segmentChunks.length > 0
      ? segmentChunks
      : fullPayload.transcript_snippet.trim().length > 0
        ? mergeTranscriptRolling(previous.transcript, fullPayload.transcript_snippet, now)
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

  const hr = payload.heart_rate_rppg?.value
  const patient_heart =
    typeof hr === 'number' && Number.isFinite(hr) && hr > 0
      ? {
          ...previous.patient_heart,
          heart_rate_bpm: hr,
          signal_source: 'rppg' as const,
          history_bpm: [...previous.patient_heart.history_bpm.slice(-19), hr],
          dispatcher_notice:
            hr >= 110
              ? 'Elevated heart rate (camera-derived estimate; not a medical device).'
              : previous.patient_heart.dispatcher_notice,
        }
      : previous.patient_heart

  const haptic_cue = mergeHapticCue(previous.haptic_cue, rawPayload)

  let cpr_guidance = previous.cpr_guidance
  if (payload.haptic_cue !== undefined && payload.haptic_cue !== null) {
    const hc = payload.haptic_cue as BackendHapticCue
    if (
      hc.pattern === 'cpr_metronome' &&
      hc.active &&
      typeof hc.bpm === 'number' &&
      Number.isFinite(hc.bpm) &&
      hc.bpm >= 60 &&
      hc.bpm <= 140
    ) {
      cpr_guidance = { active: true, bpm: Math.round(hc.bpm) }
    } else {
      cpr_guidance = { active: false, bpm: null }
    }
  }

  return {
    ...previous,
    updatedAt: now,
    caller_location,
    patient_heart,
    cpr_guidance,
    haptic_cue,
    transcript_ai_summary: payload.clear_transcript
      ? { status: 'idle', text: null, updated_at: now }
      : previous.transcript_ai_summary,
    respiratory: {
      estimated_respiratory_rate: typeof mergedRate === 'number' && !Number.isNaN(mergedRate) ? mergedRate : 0,
      respiratory_status: respiratoryStatus,
      confidence: keepResp
        ? previous.respiratory.confidence
        : Number(payload.resp_rate_estimate?.confidence ?? 0),
      source: pipelineStatus === 'live' ? 'ai' : 'mock',
      history_rr,
    },
    hazards,
    systemAlerts,
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

  const isSystem = alert.source === 'system'

  if (isSystem) {
    const withoutDup = previous.systemAlerts.filter((h) => h.id !== hazard.id)
    return {
      ...previous,
      updatedAt: detectedAt,
      systemAlerts: [hazard, ...withoutDup],
      respiratory:
        alert.severity === 'critical'
          ? { ...previous.respiratory, respiratory_status: 'critical' }
          : previous.respiratory,
    }
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
      history_rr: previous.respiratory.history_rr?.length ? previous.respiratory.history_rr : [],
    },
  }
}
