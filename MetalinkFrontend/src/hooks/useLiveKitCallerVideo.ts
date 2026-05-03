import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant,
  type RemoteVideoTrack,
} from 'livekit-client'
import type { RefObject } from 'react'
import { useEffect, useRef, useState } from 'react'

function envTrim(key: string): string {
  const raw = (import.meta.env as Record<string, string | undefined>)[key]
  return typeof raw === 'string' ? raw.trim() : ''
}

export interface LiveKitCallerBinding {
  connectionState: ConnectionState
  hasRemoteVideo: boolean
  error: string | null
}

/**
 * Subscriber-only LiveKit session: attaches the caller's remote camera to `videoRef`.
 * Never enables local camera/mic — operator workstation stays receive-only.
 */
export function useLiveKitCallerVideo(
  enabled: boolean,
  videoRef: RefObject<HTMLVideoElement | null>,
): LiveKitCallerBinding {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.Disconnected)
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const attachedRef = useRef<RemoteVideoTrack | null>(null)

  useEffect(() => {
    if (!enabled) return

    const url = envTrim('VITE_LIVEKIT_URL')
    const token = envTrim('VITE_LIVEKIT_TOKEN')
    if (!url || !token) {
      console.warn('[livekit] VITE_LIVEKIT_URL / VITE_LIVEKIT_TOKEN missing — skipping join')
      return
    }

    const callerIdentity = envTrim('VITE_LIVEKIT_CALLER_PARTICIPANT_IDENTITY') || 'caller'
    const operatorIdentity = envTrim('VITE_LIVEKIT_OPERATOR_PARTICIPANT_IDENTITY') || 'dispatcher'

    const room = new Room({ adaptiveStream: true, dynacast: true })
    let cancelled = false

    const detachCurrent = () => {
      const el = videoRef.current
      const cur = attachedRef.current
      if (cur && el) {
        cur.detach(el)
      }
      attachedRef.current = null
      setHasRemoteVideo(false)
    }

    const pickCaller = (): RemoteParticipant | undefined => {
      const remotes = [...room.remoteParticipants.values()]
      const exact = remotes.find((p) => p.identity === callerIdentity)
      if (exact) return exact
      return remotes.find((p) => p.identity !== operatorIdentity)
    }

    const syncAttach = () => {
      if (cancelled) return
      const el = videoRef.current
      if (!el) return

      detachCurrent()

      const caller = pickCaller()
      if (!caller) return

      const pub = caller.getTrackPublication(Track.Source.Camera)
      if (!pub?.isSubscribed || !pub.videoTrack) {
        return
      }

      const vt = pub.videoTrack as RemoteVideoTrack
      vt.attach(el)
      attachedRef.current = vt
      setHasRemoteVideo(true)
      void el.play().catch(() => {})
    }

    const onConn = () => setConnectionState(room.state)
    room.on(RoomEvent.ConnectionStateChanged, onConn)

    room.on(RoomEvent.ParticipantConnected, syncAttach)
    room.on(RoomEvent.ParticipantDisconnected, syncAttach)
    room.on(RoomEvent.TrackSubscribed, syncAttach)
    room.on(RoomEvent.TrackUnsubscribed, syncAttach)
    room.on(RoomEvent.TrackMuted, syncAttach)
    room.on(RoomEvent.TrackUnmuted, syncAttach)

    ;(async () => {
      try {
        setError(null)
        await room.connect(url, token, { autoSubscribe: true })
        await room.localParticipant.setCameraEnabled(false)
        await room.localParticipant.setMicrophoneEnabled(false)
        setConnectionState(room.state)
        syncAttach()
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'LiveKit connection failed')
          setConnectionState(ConnectionState.Disconnected)
        }
      }
    })()

    return () => {
      cancelled = true
      room.removeAllListeners()
      detachCurrent()
      void room.disconnect(true).catch(() => {})
      setConnectionState(ConnectionState.Disconnected)
      setHasRemoteVideo(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable RefObject from parent
  }, [enabled])

  return { connectionState, hasRemoteVideo, error }
}
