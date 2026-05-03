import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type LocalParticipant,
  type RemoteAudioTrack,
  type RemoteParticipant,
  type RemoteVideoTrack,
} from 'livekit-client'
import type { RefObject } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { resolveLiveKitSession } from '@/services/livekitSession'

function envTrim(key: string): string {
  const raw = (import.meta.env as Record<string, string | undefined>)[key]
  return typeof raw === 'string' ? raw.trim() : ''
}

/** Signal transport exposes ping RTT (ms) once connected. */
function readSignalRttMs(room: Room | null): number | null {
  if (!room || room.state !== ConnectionState.Connected) return null
  try {
    const engine = room.engine as { client?: { rtt?: number } }
    const ms = engine.client?.rtt
    if (typeof ms === 'number' && ms > 0 && ms < 60000) {
      return Math.round(ms)
    }
  } catch {
    /* ignore */
  }
  return null
}

export interface LiveKitCallerBinding {
  connectionState: ConnectionState
  hasRemoteVideo: boolean
  hasRemoteAudio: boolean
  remoteMicMuted: boolean
  /** Dispatcher mic publication state (operator -> caller). */
  isLocalMicLive: boolean
  localMicError: string | null
  error: string | null
  isSessionLoading: boolean
  /** LiveKit signalling RTT when available (preferred for Live feed latency chip). */
  signalRttMs: number | null
  /** Operator outgoing mic published (two-way audio). */
  operatorMicEnabled: boolean
  operatorMicBlocked: boolean
  toggleOperatorMic: () => Promise<void>
}

/** Operator LiveKit session: caller camera/mic in, dispatcher mic out (camera stays off). */
export function useLiveKitCallerVideo(
  enabled: boolean,
  videoRef: RefObject<HTMLVideoElement | null>,
  audioRef: RefObject<HTMLAudioElement | null>,
): LiveKitCallerBinding {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.Disconnected)
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false)
  const [hasRemoteAudio, setHasRemoteAudio] = useState(false)
  const [remoteMicMuted, setRemoteMicMuted] = useState(false)
  const [isLocalMicLive, setIsLocalMicLive] = useState(false)
  const [localMicError, setLocalMicError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSessionLoading, setIsSessionLoading] = useState(enabled)
  const [signalRttMs, setSignalRttMs] = useState<number | null>(null)
  const [operatorMicEnabled, setOperatorMicEnabled] = useState(false)
  const [operatorMicBlocked, setOperatorMicBlocked] = useState(false)

  const attachedVideoRef = useRef<RemoteVideoTrack | null>(null)
  const attachedAudioRef = useRef<RemoteAudioTrack | null>(null)
  const roomRef = useRef<Room | null>(null)

  const syncLocalMicState = useCallback((lp: LocalParticipant) => {
    setOperatorMicEnabled(lp.isMicrophoneEnabled)
    setIsLocalMicLive(lp.isMicrophoneEnabled)
  }, [])

  useEffect(() => {
    if (!enabled) {
      return
    }

    const callerIdentity = envTrim('VITE_LIVEKIT_CALLER_PARTICIPANT_IDENTITY') || 'caller'
    const legacyOperatorAlias = envTrim('VITE_LIVEKIT_OPERATOR_PARTICIPANT_IDENTITY') || 'dispatcher'
    const backendIngestIdentity = envTrim('VITE_LIVEKIT_BACKEND_PARTICIPANT_IDENTITY') || 'aegis-link-backend'

    let cancelled = false

    const detachVideo = () => {
      const el = videoRef.current
      const cur = attachedVideoRef.current
      if (cur && el) cur.detach(el)
      attachedVideoRef.current = null
      setHasRemoteVideo(false)
    }

    const detachAudio = () => {
      const el = audioRef.current
      const cur = attachedAudioRef.current
      if (cur && el) cur.detach(el)
      attachedAudioRef.current = null
      setHasRemoteAudio(false)
    }

    const pickCaller = (room: Room): RemoteParticipant | undefined => {
      const remotes = [...room.remoteParticipants.values()]
      const exact = remotes.find((p) => p.identity === callerIdentity)
      if (exact) return exact

      const excluded = new Set(
        [legacyOperatorAlias, backendIngestIdentity].filter((s) => s.length > 0),
      )
      const candidates = remotes.filter((p) => !excluded.has(p.identity))
      const withCamera = candidates.find((p) => {
        const pub = p.getTrackPublication(Track.Source.Camera)
        return Boolean(pub?.track)
      })
      if (withCamera) return withCamera
      return candidates[0]
    }

    const syncCallerTracks = (room: Room) => {
      if (cancelled) return
      const videoEl = videoRef.current
      const audioEl = audioRef.current
      if (!videoEl || !audioEl) return

      detachVideo()
      detachAudio()

      const caller = pickCaller(room)
      if (!caller) {
        setRemoteMicMuted(false)
        return
      }

      const camPub = caller.getTrackPublication(Track.Source.Camera)
      if (camPub?.isSubscribed && camPub.videoTrack) {
        const vt = camPub.videoTrack as RemoteVideoTrack
        vt.attach(videoEl)
        attachedVideoRef.current = vt
        setHasRemoteVideo(true)
        void videoEl.play().catch(() => {})
      }

      const micPub = caller.getTrackPublication(Track.Source.Microphone)
      if (micPub?.isSubscribed && micPub.audioTrack) {
        const at = micPub.audioTrack as RemoteAudioTrack
        at.attach(audioEl)
        attachedAudioRef.current = at
        setHasRemoteAudio(true)
        setRemoteMicMuted(Boolean(micPub.isMuted))
        void audioEl.play().catch(() => {})
      } else {
        setRemoteMicMuted(false)
      }
    }

    ;(async () => {
      setIsSessionLoading(true)
      setError(null)
      setLocalMicError(null)
      setOperatorMicBlocked(false)
      let session: Awaited<ReturnType<typeof resolveLiveKitSession>>
      try {
        session = await resolveLiveKitSession()
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to resolve LiveKit session')
          setConnectionState(ConnectionState.Disconnected)
          setIsSessionLoading(false)
        }
        return
      }

      if (cancelled) return
      setIsSessionLoading(false)

      const room = new Room({ adaptiveStream: true, dynacast: true })
      roomRef.current = room

      const onConn = () => setConnectionState(room.state)
      const resync = () => syncCallerTracks(room)

      room.on(RoomEvent.ConnectionStateChanged, onConn)
      room.on(RoomEvent.ParticipantConnected, resync)
      room.on(RoomEvent.ParticipantDisconnected, resync)
      room.on(RoomEvent.TrackSubscribed, resync)
      room.on(RoomEvent.TrackUnsubscribed, resync)
      room.on(RoomEvent.TrackMuted, resync)
      room.on(RoomEvent.TrackUnmuted, resync)
      room.on(RoomEvent.LocalTrackPublished, () => syncLocalMicState(room.localParticipant))
      room.on(RoomEvent.LocalTrackUnpublished, () => syncLocalMicState(room.localParticipant))

      try {
        await room.connect(session.url, session.token, { autoSubscribe: true })
        if (cancelled) {
          room.removeAllListeners()
          detachVideo()
          detachAudio()
          void room.disconnect(true).catch(() => {})
          roomRef.current = null
          return
        }

        await room.localParticipant.setCameraEnabled(false)
        try {
          await room.localParticipant.setMicrophoneEnabled(true)
          setIsLocalMicLive(true)
          setLocalMicError(null)
          setOperatorMicBlocked(false)
          syncLocalMicState(room.localParticipant)
        } catch (e) {
          setIsLocalMicLive(false)
          setOperatorMicBlocked(true)
          setLocalMicError(e instanceof Error ? e.message : 'Microphone permission denied or unavailable')
        }
        setConnectionState(room.state)
        syncCallerTracks(room)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'LiveKit connection failed')
          setConnectionState(ConnectionState.Disconnected)
        }
        if (roomRef.current === room) {
          room.removeAllListeners()
          roomRef.current = null
          void room.disconnect(true).catch(() => {})
        }
      }
    })()

    return () => {
      cancelled = true
      const room = roomRef.current
      roomRef.current = null
      if (room) {
        room.removeAllListeners()
      }
      detachVideo()
      detachAudio()
      if (room) {
        void room.disconnect(true).catch(() => {})
      }
      setConnectionState(ConnectionState.Disconnected)
      setHasRemoteVideo(false)
      setHasRemoteAudio(false)
      setRemoteMicMuted(false)
      setIsLocalMicLive(false)
      setLocalMicError(null)
      setIsSessionLoading(false)
      setSignalRttMs(null)
      setOperatorMicEnabled(false)
      setOperatorMicBlocked(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable RefObjects from parent
  }, [enabled, syncLocalMicState])

  useEffect(() => {
    if (!enabled || !roomRef.current) return
    const room = roomRef.current
    const tick = () => {
      setSignalRttMs(readSignalRttMs(room))
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [enabled, connectionState])

  const toggleOperatorMic = useCallback(async () => {
    const room = roomRef.current
    if (!room || room.state !== ConnectionState.Connected) return
    const lp = room.localParticipant
    const next = !lp.isMicrophoneEnabled
    try {
      await lp.setMicrophoneEnabled(next)
      setOperatorMicBlocked(false)
      setOperatorMicEnabled(lp.isMicrophoneEnabled)
      setIsLocalMicLive(lp.isMicrophoneEnabled)
    } catch (e) {
      console.warn('[livekit] toggle mic failed', e)
      setOperatorMicBlocked(true)
    }
  }, [])

  return {
    connectionState,
    hasRemoteVideo,
    hasRemoteAudio,
    remoteMicMuted,
    isLocalMicLive,
    localMicError,
    error,
    isSessionLoading,
    signalRttMs,
    operatorMicEnabled,
    operatorMicBlocked,
    toggleOperatorMic,
  }
}
