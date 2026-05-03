import type {
  DashboardTelemetryPayload,
  PatientCardiacMode,
  PatientHeartTelemetry,
  TranscriptAISummaryTelemetry,
  TranscriptAISummaryStatus,
} from '@/types/dashboard'

function asIsoString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

const PATIENT_CARDIAC_MODES: PatientCardiacMode[] = [
  'stable',
  'elevated_stress',
  'hypoperfusion_watch',
  'compensatory_tachycardia',
  'critical_intervention',
]

function normalizePatientHeart(data: Partial<DashboardTelemetryPayload>): PatientHeartTelemetry {
  const raw = data.patient_heart
  const mode = PATIENT_CARDIAC_MODES.includes(raw?.mode as PatientCardiacMode)
    ? (raw?.mode as PatientCardiacMode)
    : 'stable'
  const history = Array.isArray(raw?.history_bpm)
    ? raw.history_bpm.map(Number).filter((n) => Number.isFinite(n))
    : []
  const bpm = Number(raw?.heart_rate_bpm ?? (history.at(-1) ?? 0))
  const notice =
    typeof raw?.dispatcher_notice === 'string'
      ? raw.dispatcher_notice
      : 'No cardiac advisory text supplied.'
  const source =
    raw?.signal_source === 'rppg' || raw?.signal_source === 'mock' || raw?.signal_source === 'unknown'
      ? raw.signal_source
      : 'unknown'
  const historySafe = history.length > 0 ? history : Number.isFinite(bpm) && bpm > 0 ? [bpm] : []

  return {
    heart_rate_bpm: Number.isFinite(bpm) ? bpm : 0,
    mode,
    dispatcher_notice: notice,
    signal_source: source,
    history_bpm: historySafe,
  }
}

function normalizeTranscriptAISummary(data: Partial<DashboardTelemetryPayload>): TranscriptAISummaryTelemetry {
  const raw = data.transcript_ai_summary
  const allowed: TranscriptAISummaryStatus[] = ['idle', 'loading', 'ready', 'error']
  let status: TranscriptAISummaryStatus =
    typeof raw?.status === 'string' && allowed.includes(raw.status as TranscriptAISummaryStatus)
      ? (raw.status as TranscriptAISummaryStatus)
      : 'idle'
  const text = typeof raw?.text === 'string' ? raw.text : null
  if (status === 'idle' && text?.trim()) {
    status = 'ready'
  }

  return {
    status,
    text,
    error_detail: typeof raw?.error_detail === 'string' ? raw.error_detail : undefined,
    updated_at: typeof raw?.updated_at === 'string' ? raw.updated_at : undefined,
  }
}

export function normalizeTelemetryPayload(input: unknown): DashboardTelemetryPayload {
  const now = new Date().toISOString()
  const data = (input ?? {}) as Partial<DashboardTelemetryPayload>

  return {
    schemaVersion: typeof data.schemaVersion === 'string' ? data.schemaVersion : '0.1.0',
    updatedAt: asIsoString(data.updatedAt, now),
    session: {
      id: data.session?.id ?? 'unknown-session',
      incident_type: data.session?.incident_type ?? 'unknown',
      caller_label: data.session?.caller_label ?? 'Unknown caller',
      started_at: asIsoString(data.session?.started_at, now),
    },
    respiratory: {
      estimated_respiratory_rate: Number(data.respiratory?.estimated_respiratory_rate ?? 0),
      respiratory_status: data.respiratory?.respiratory_status ?? 'watch',
      confidence: Number(data.respiratory?.confidence ?? 0),
      source: data.respiratory?.source ?? 'mock',
    },
    hazards: Array.isArray(data.hazards) ? data.hazards : [],
    transcript: Array.isArray(data.transcript) ? data.transcript : [],
    transcript_ai_summary: normalizeTranscriptAISummary(data),
    video: {
      posterUrl: data.video?.posterUrl ?? null,
      streamStatus: data.video?.streamStatus ?? 'disconnected',
      streamUrl: typeof data.video?.streamUrl === 'string' ? data.video.streamUrl || null : null,
    },
    operator: {
      heart_rate_bpm: Number(data.operator?.heart_rate_bpm ?? 72),
    },
    caller_location: {
      label: typeof data.caller_location?.label === 'string' ? data.caller_location.label : 'Location unavailable',
      latitude: Number(data.caller_location?.latitude ?? Number.NaN),
      longitude: Number(data.caller_location?.longitude ?? Number.NaN),
      accuracy_m:
        typeof data.caller_location?.accuracy_m === 'number' ? data.caller_location.accuracy_m : undefined,
      updated_at:
        typeof data.caller_location?.updated_at === 'string' ? data.caller_location.updated_at : undefined,
    },
    patient_heart: normalizePatientHeart(data),
  }
}
