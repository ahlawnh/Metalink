export interface LiveKitSessionPayload {
  url: string
  token: string
  room: string
  identity: string
}

function trimEnv(key: string): string {
  const raw = (import.meta.env as Record<string, string | undefined>)[key]
  return typeof raw === 'string' ? raw.trim() : ''
}

/**
 * Resolve LiveKit URL + JWT: prefer static env pair; otherwise GET `/api/livekit/token`
 * from `VITE_TELEMETRY_API_ORIGIN` (unique operator identity per load).
 */
export async function resolveLiveKitSession(): Promise<LiveKitSessionPayload> {
  const envUrl = trimEnv('VITE_LIVEKIT_URL')
  const envToken = trimEnv('VITE_LIVEKIT_TOKEN')
  if (envUrl && envToken) {
    return {
      url: envUrl,
      token: envToken,
      room: trimEnv('VITE_LIVEKIT_ROOM'),
      identity: trimEnv('VITE_LIVEKIT_OPERATOR_PARTICIPANT_IDENTITY') || 'env-operator',
    }
  }

  const origin = trimEnv('VITE_TELEMETRY_API_ORIGIN')
  if (!origin) {
    throw new Error(
      'LiveKit: set VITE_LIVEKIT_URL + VITE_LIVEKIT_TOKEN, or VITE_TELEMETRY_API_ORIGIN for /api/livekit/token',
    )
  }

  const base = origin.replace(/\/$/, '')
  const identityBase = trimEnv('VITE_LIVEKIT_OPERATOR_PARTICIPANT_IDENTITY') || 'metalink-operator'
  const identity = `${identityBase}-${crypto.randomUUID().slice(0, 10)}`
  const res = await fetch(`${base}/api/livekit/token?identity=${encodeURIComponent(identity)}`, {
    credentials: 'same-origin',
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = (await res.json()) as { detail?: string }
      if (typeof body.detail === 'string') detail = body.detail
    } catch {
      try {
        detail = (await res.text()).slice(0, 240)
      } catch {
        /* ignore */
      }
    }
    throw new Error(`LiveKit token request failed (${res.status}): ${detail}`)
  }

  return res.json() as Promise<LiveKitSessionPayload>
}
