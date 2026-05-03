import type { DashboardTelemetryPayload } from '@/types/dashboard'

/** Last row from `GET /api/incident/telemetry/recent` (FastAPI `IncidentTelemetryIn` JSON). */
export type IncidentTelemetryRecentRow = {
  sentAt?: string
  location?: {
    latitude: number
    longitude: number
    accuracyM?: number | null
    recordedAt?: string
  } | null
  vitals?: {
    heartRateBpm?: number | null
    respiratoryRate?: number | null
    bpmAnalyzing?: boolean
  }
}

export function buildIncidentRecentPollUrl(): string | null {
  try {
    const origin =
      (import.meta.env.VITE_TELEMETRY_API_ORIGIN as string | undefined)?.trim() || 'http://127.0.0.1:8000'
    const u = new URL(origin)
    u.pathname = '/api/incident/telemetry/recent'
    u.searchParams.set('limit', '1')
    return u.toString()
  } catch {
    return null
  }
}

export function mergeIncidentIntoTelemetry(
  prev: DashboardTelemetryPayload,
  row: IncidentTelemetryRecentRow | null | undefined,
): DashboardTelemetryPayload {
  if (!row) return prev

  const sentAt = typeof row.sentAt === 'string' ? row.sentAt : new Date().toISOString()

  const loc = row.location
  let caller_location = prev.caller_location
  if (loc && typeof loc.latitude === 'number' && typeof loc.longitude === 'number') {
    caller_location = {
      label: 'Caller · incident feed (browser GPS)',
      latitude: loc.latitude,
      longitude: loc.longitude,
      accuracy_m: typeof loc.accuracyM === 'number' ? loc.accuracyM : prev.caller_location.accuracy_m,
      updated_at: typeof loc.recordedAt === 'string' ? loc.recordedAt : sentAt,
    }
  }

  const v = row.vitals
  let patient_heart = prev.patient_heart
  let respiratory = prev.respiratory

  const analyzing = Boolean(v?.bpmAnalyzing)
  const hrRaw = v?.heartRateBpm
  if (!analyzing && typeof hrRaw === 'number' && Number.isFinite(hrRaw) && hrRaw > 0) {
    const bpm = Math.round(hrRaw)
    patient_heart = {
      ...patient_heart,
      heart_rate_bpm: bpm,
      history_bpm: [...patient_heart.history_bpm, bpm].slice(-32),
      signal_source: 'rppg',
    }
  }

  const rrRaw = v?.respiratoryRate
  if (typeof rrRaw === 'number' && Number.isFinite(rrRaw) && rrRaw > 0) {
    const rr = Math.round(rrRaw)
    const prevStatus = prev.respiratory.respiratory_status
    respiratory = {
      ...respiratory,
      estimated_respiratory_rate: rr,
      history_rr: [...(respiratory.history_rr ?? []), rr].slice(-32),
      source: 'rppg',
      confidence: Math.max(respiratory.confidence, 0.55),
      respiratory_status:
        prevStatus === 'critical'
          ? 'critical'
          : rr > 0 && rr < 12
            ? 'watch'
            : 'normal',
    }
  }

  return {
    ...prev,
    updatedAt: sentAt,
    caller_location,
    patient_heart,
    respiratory,
  }
}
