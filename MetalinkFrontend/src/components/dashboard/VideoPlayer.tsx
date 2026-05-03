import Draggable from 'react-draggable'
import { ConnectionState } from 'livekit-client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLiveKitCallerVideo } from '@/hooks/useLiveKitCallerVideo'
import { cn } from '@/lib/utils'
import type { VideoTelemetry } from '@/types/dashboard'

const FALLBACK_CLIP = 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4'

function liveKitConfigured(): boolean {
  const u = typeof import.meta.env.VITE_LIVEKIT_URL === 'string' ? import.meta.env.VITE_LIVEKIT_URL.trim() : ''
  const t = typeof import.meta.env.VITE_LIVEKIT_TOKEN === 'string' ? import.meta.env.VITE_LIVEKIT_TOKEN.trim() : ''
  return Boolean(u && t)
}

/** Fallback MP4 / progressive URL player driven by telemetry `video.streamUrl`. */
function FallbackTelemetryVideo({
  src,
  streamUrl,
  posterUrl,
  streamStatus = 'connected',
  latencyMs = 42,
}: {
  src?: string | null
  streamUrl?: string | null
  posterUrl?: string | null
  streamStatus?: VideoTelemetry['streamStatus']
  latencyMs?: number
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const dragNodeRef = useRef<HTMLDivElement>(null)

  const [isPlaying, setIsPlaying] = useState(true)
  const [isMuted, setIsMuted] = useState(true)
  const [floating, setFloating] = useState(false)
  const [pipActive, setPipActive] = useState(false)
  const [mediaPlaying, setMediaPlaying] = useState(false)

  const effectiveSrc = useMemo(() => {
    const envClip =
      typeof import.meta.env.VITE_VIDEO_STREAM_URL === 'string' ? import.meta.env.VITE_VIDEO_STREAM_URL.trim() : ''
    const fromTel = streamUrl?.trim()
    const fromProp = src?.trim()
    return (fromTel || fromProp || envClip || FALLBACK_CLIP).trim()
  }, [src, streamUrl])

  const syncPlaybackFlag = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    setMediaPlaying(!v.paused && v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA)
  }, [])

  const syncPlaying = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    setIsPlaying(!v.paused)
    syncPlaybackFlag()
  }, [syncPlaybackFlag])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.defaultMuted = true
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onVolume = () => setIsMuted(video.muted || video.volume === 0)
    const onPipEnter = () => setPipActive(true)
    const onPipLeave = () => setPipActive(false)
    const onPlayback = () => syncPlaybackFlag()
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('volumechange', onVolume)
    video.addEventListener('enterpictureinpicture', onPipEnter)
    video.addEventListener('leavepictureinpicture', onPipLeave)
    video.addEventListener('playing', onPlayback)
    video.addEventListener('waiting', onPlayback)
    video.addEventListener('loadeddata', onPlayback)
    void video.play().catch(() => {})
    syncPlaybackFlag()
    return () => {
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('volumechange', onVolume)
      video.removeEventListener('enterpictureinpicture', onPipEnter)
      video.removeEventListener('leavepictureinpicture', onPipLeave)
      video.removeEventListener('playing', onPlayback)
      video.removeEventListener('waiting', onPlayback)
      video.removeEventListener('loadeddata', onPlayback)
    }
  }, [effectiveSrc, syncPlaybackFlag])

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) void v.play()
    else v.pause()
    syncPlaying()
  }, [syncPlaying])

  const toggleMute = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
    if (!v.muted && v.volume === 0) v.volume = 1
    setIsMuted(v.muted)
  }, [])

  const toggleFullscreen = useCallback(() => {
    const root = shellRef.current
    if (!root) return
    if (document.fullscreenElement) void document.exitFullscreen()
    else void root.requestFullscreen()
  }, [])

  const dockFloating = useCallback(() => setFloating(false), [])

  const handlePopOutClick = useCallback(async () => {
    const v = videoRef.current
    if (!v) return

    if (floating) {
      dockFloating()
      return
    }

    if (document.pictureInPictureElement === v) {
      await document.exitPictureInPicture()
      return
    }

    if (typeof v.requestPictureInPicture === 'function') {
      try {
        await v.requestPictureInPicture()
        setFloating(false)
        return
      } catch {
        setFloating(true)
        return
      }
    }

    setFloating(true)
  }, [floating, dockFloating])

  const ctrlBtn =
    'rounded-md bg-[var(--dash-surface-raised)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--dash-text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-white/[0.08] hover:bg-[color-mix(in_srgb,var(--dash-surface-raised)_92%,#fff)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dash-accent)]'

  const pipSupported =
    typeof document !== 'undefined' &&
    'pictureInPictureEnabled' in document &&
    document.pictureInPictureEnabled !== false

  const streamEstablished = streamStatus === 'connected' && mediaPlaying
  const showLivePov = Boolean(effectiveSrc) && mediaPlaying
  const showStreamChip = streamEstablished

  const videoShell = (
    <div
      ref={shellRef}
      className={cn('dash-inset relative aspect-video w-full overflow-hidden bg-[var(--dash-bg)]')}
    >
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        src={effectiveSrc}
        poster={posterUrl ?? undefined}
        autoPlay
        muted
        loop
        playsInline
        aria-label="Live bystander point-of-view video feed"
        onPlay={syncPlaying}
        onPause={syncPlaying}
      />

      <div className="absolute bottom-0 left-0 right-0 z-20 flex flex-wrap items-center gap-2 bg-[color-mix(in_srgb,var(--dash-bg)_92%,transparent)] px-3 py-2 backdrop-blur-sm">
        <button type="button" onClick={togglePlay} className={ctrlBtn}>
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button type="button" onClick={toggleMute} className={ctrlBtn}>
          {isMuted ? 'Unmute' : 'Mute'}
        </button>
        <button type="button" onClick={toggleFullscreen} className={ctrlBtn}>
          Fullscreen
        </button>
        <button type="button" onClick={() => void handlePopOutClick()} className={ctrlBtn}>
          {pipActive ? 'Exit PiP' : floating ? 'Dock' : 'Pop-out'}
        </button>
        <span className="ml-auto font-data text-[11px] font-semibold tabular-nums text-[var(--dash-text-primary)]">
          Latency <span className="text-[var(--dash-accent)]">{latencyMs}</span> ms
        </span>
      </div>

      <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-col items-start gap-2">
        {showLivePov ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-red-500/85 bg-red-950/88 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-red-100 ring-1 ring-red-400/35">
            <span className="size-2 animate-pulse rounded-full bg-red-400" />
            Live POV
          </span>
        ) : null}
        {showStreamChip ? (
          <span className="pointer-events-none inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,#00FF8845%,transparent)] bg-[color-mix(in_srgb,#00FF8818%,var(--dash-bg))] px-2.5 py-1 font-data text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7CFFB3]">
            <span className="size-1.5 rounded-full bg-[#00FF88]" />
            Stream connected
          </span>
        ) : null}
      </div>

      {!pipSupported ? (
        <p className="pointer-events-none absolute bottom-14 left-3 max-w-[14rem] text-[10px] leading-snug text-[var(--dash-text-secondary)]">
          PiP unsupported — Pop-out uses a draggable window.
        </p>
      ) : null}
    </div>
  )

  const cardBody = (
    <section
      ref={dragNodeRef}
      className={cn(
        'dash-card w-full p-3',
        floating &&
          'fixed left-[min(8vw,48px)] top-[min(14vh,120px)] z-[920] w-[min(440px,calc(100vw-24px))] cursor-grab shadow-[0_28px_90px_rgba(0,0,0,0.72)] ring-2 ring-[color-mix(in_srgb,#00E5FF_22%,transparent)] active:cursor-grabbing',
      )}
    >
      <div
        className={cn(
          'video-drag-handle mb-2 flex cursor-grab items-center gap-2 rounded-md bg-[var(--dash-surface-raised)] px-2 py-1.5 ring-1 ring-white/[0.08] active:cursor-grabbing',
          !floating && 'hidden',
        )}
      >
        <span className="dash-label normal-case tracking-normal text-[var(--dash-text-secondary)]">
          Floating feed · drag header
        </span>
        <button
          type="button"
          onClick={dockFloating}
          className="ml-auto rounded bg-[var(--dash-bg)] px-2 py-1 font-data text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--dash-text-primary)] ring-1 ring-white/[0.1] hover:bg-[var(--dash-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
        >
          Dock
        </button>
      </div>
      {videoShell}
    </section>
  )

  return (
    <>
      {floating ? (
        <div className="dash-inset mb-3 shrink-0 px-3 py-2 text-center">
          <p className="text-xs font-medium text-[var(--dash-text-secondary)]">
            Video is in a draggable floating window.
            <button
              type="button"
              onClick={dockFloating}
              className="ml-2 font-semibold text-[#80FFFF] underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
            >
              Dock here
            </button>
          </p>
        </div>
      ) : null}

      <Draggable disabled={!floating} handle=".video-drag-handle" nodeRef={dragNodeRef} cancel="button">
        {cardBody}
      </Draggable>
    </>
  )
}

/** LiveKit subscriber: caller remote camera only, no local capture. */
function LiveKitCallerVideo({ latencyMs = 42, posterUrl }: { latencyMs?: number; posterUrl?: string | null }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const dragNodeRef = useRef<HTMLDivElement>(null)

  const { connectionState, hasRemoteVideo, error } = useLiveKitCallerVideo(true, videoRef)

  const [isPlaying, setIsPlaying] = useState(true)
  const [isMuted, setIsMuted] = useState(true)
  const [floating, setFloating] = useState(false)
  const [pipActive, setPipActive] = useState(false)
  const [mediaPlaying, setMediaPlaying] = useState(false)

  const syncPlaybackFlag = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    setMediaPlaying(!v.paused && v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA)
  }, [])

  const syncPlaying = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    setIsPlaying(!v.paused)
    syncPlaybackFlag()
  }, [syncPlaybackFlag])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.defaultMuted = true
    const onPipEnter = () => setPipActive(true)
    const onPipLeave = () => setPipActive(false)
    const onPlayback = () => syncPlaybackFlag()
    video.addEventListener('enterpictureinpicture', onPipEnter)
    video.addEventListener('leavepictureinpicture', onPipLeave)
    video.addEventListener('playing', onPlayback)
    video.addEventListener('waiting', onPlayback)
    video.addEventListener('pause', onPlayback)
    video.addEventListener('loadeddata', onPlayback)
    void video.play().catch(() => {})
    syncPlaybackFlag()
    return () => {
      video.removeEventListener('enterpictureinpicture', onPipEnter)
      video.removeEventListener('leavepictureinpicture', onPipLeave)
      video.removeEventListener('playing', onPlayback)
      video.removeEventListener('waiting', onPlayback)
      video.removeEventListener('pause', onPlayback)
      video.removeEventListener('loadeddata', onPlayback)
    }
  }, [connectionState, hasRemoteVideo, syncPlaybackFlag])

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) void v.play()
    else v.pause()
    syncPlaying()
  }, [syncPlaying])

  const toggleMute = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
    if (!v.muted && v.volume === 0) v.volume = 1
    setIsMuted(v.muted)
  }, [])

  const toggleFullscreen = useCallback(() => {
    const root = shellRef.current
    if (!root) return
    if (document.fullscreenElement) void document.exitFullscreen()
    else void root.requestFullscreen()
  }, [])

  const dockFloating = useCallback(() => setFloating(false), [])

  const handlePopOutClick = useCallback(async () => {
    const v = videoRef.current
    if (!v) return

    if (floating) {
      dockFloating()
      return
    }

    if (document.pictureInPictureElement === v) {
      await document.exitPictureInPicture()
      return
    }

    if (typeof v.requestPictureInPicture === 'function') {
      try {
        await v.requestPictureInPicture()
        setFloating(false)
        return
      } catch {
        setFloating(true)
        return
      }
    }

    setFloating(true)
  }, [floating, dockFloating])

  const ctrlBtn =
    'rounded-md bg-[var(--dash-surface-raised)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--dash-text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-white/[0.08] hover:bg-[color-mix(in_srgb,var(--dash-surface-raised)_92%,#fff)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dash-accent)]'

  const pipSupported =
    typeof document !== 'undefined' &&
    'pictureInPictureEnabled' in document &&
    document.pictureInPictureEnabled !== false

  const rtcConnected = connectionState === ConnectionState.Connected
  const streamEstablished = rtcConnected && hasRemoteVideo && mediaPlaying
  const showLivePov = hasRemoteVideo && mediaPlaying && rtcConnected
  const showStreamChip = streamEstablished

  const videoShell = (
    <div ref={shellRef} className="dash-inset relative aspect-video w-full overflow-hidden bg-[var(--dash-bg)]">
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        poster={posterUrl ?? undefined}
        muted
        playsInline
        autoPlay
        aria-label="Live bystander point-of-view video feed (LiveKit)"
        onPlay={syncPlaying}
        onPause={syncPlaying}
      />

      {error ? (
        <div className="pointer-events-none absolute left-3 right-3 top-12 z-10 rounded-md bg-[color-mix(in_srgb,#FF174428%,var(--dash-bg))] px-2 py-1.5 text-center text-[11px] font-medium text-[#FFAB91] ring-1 ring-[color-mix(in_srgb,#FF1744_35%,transparent)]">
          LiveKit: {error}
        </div>
      ) : null}

      <div className="absolute bottom-0 left-0 right-0 z-20 flex flex-wrap items-center gap-2 bg-[color-mix(in_srgb,var(--dash-bg)_92%,transparent)] px-3 py-2 backdrop-blur-sm">
        <button type="button" onClick={togglePlay} className={ctrlBtn}>
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button type="button" onClick={toggleMute} className={ctrlBtn}>
          {isMuted ? 'Unmute' : 'Mute'}
        </button>
        <button type="button" onClick={toggleFullscreen} className={ctrlBtn}>
          Fullscreen
        </button>
        <button type="button" onClick={() => void handlePopOutClick()} className={ctrlBtn}>
          {pipActive ? 'Exit PiP' : floating ? 'Dock' : 'Pop-out'}
        </button>
        <span className="ml-auto font-data text-[11px] font-semibold tabular-nums text-[var(--dash-text-primary)]">
          Latency <span className="text-[var(--dash-accent)]">{latencyMs}</span> ms
        </span>
      </div>

      <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-col items-start gap-2">
        {showLivePov ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-red-500/85 bg-red-950/88 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-red-100 ring-1 ring-red-400/35">
            <span className="size-2 animate-pulse rounded-full bg-red-400" />
            Live POV
          </span>
        ) : null}
        {showStreamChip ? (
          <span className="pointer-events-none inline-flex items-center gap-2 rounded-full border border-[color-mix(in_srgb,#00FF8845%,transparent)] bg-[color-mix(in_srgb,#00FF8818%,var(--dash-bg))] px-2.5 py-1 font-data text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7CFFB3]">
            <span className="size-1.5 rounded-full bg-[#00FF88]" />
            Stream connected
          </span>
        ) : null}
      </div>

      {!pipSupported ? (
        <p className="pointer-events-none absolute bottom-14 left-3 max-w-[14rem] text-[10px] leading-snug text-[var(--dash-text-secondary)]">
          PiP unsupported — Pop-out uses a draggable window.
        </p>
      ) : null}
    </div>
  )

  const cardBody = (
    <section
      ref={dragNodeRef}
      className={cn(
        'dash-card w-full p-3',
        floating &&
          'fixed left-[min(8vw,48px)] top-[min(14vh,120px)] z-[920] w-[min(440px,calc(100vw-24px))] cursor-grab shadow-[0_28px_90px_rgba(0,0,0,0.72)] ring-2 ring-[color-mix(in_srgb,#00E5FF_22%,transparent)] active:cursor-grabbing',
      )}
    >
      <div
        className={cn(
          'video-drag-handle mb-2 flex cursor-grab items-center gap-2 rounded-md bg-[var(--dash-surface-raised)] px-2 py-1.5 ring-1 ring-white/[0.08] active:cursor-grabbing',
          !floating && 'hidden',
        )}
      >
        <span className="dash-label normal-case tracking-normal text-[var(--dash-text-secondary)]">
          Floating feed · drag header
        </span>
        <button
          type="button"
          onClick={dockFloating}
          className="ml-auto rounded bg-[var(--dash-bg)] px-2 py-1 font-data text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--dash-text-primary)] ring-1 ring-white/[0.1] hover:bg-[var(--dash-surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
        >
          Dock
        </button>
      </div>
      {videoShell}
    </section>
  )

  return (
    <>
      {floating ? (
        <div className="dash-inset mb-3 shrink-0 px-3 py-2 text-center">
          <p className="text-xs font-medium text-[var(--dash-text-secondary)]">
            Video is in a draggable floating window.
            <button
              type="button"
              onClick={dockFloating}
              className="ml-2 font-semibold text-[#80FFFF] underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]"
            >
              Dock here
            </button>
          </p>
        </div>
      ) : null}

      <Draggable disabled={!floating} handle=".video-drag-handle" nodeRef={dragNodeRef} cancel="button">
        {cardBody}
      </Draggable>
    </>
  )
}

interface VideoPlayerProps {
  src?: string | null
  streamUrl?: string | null
  posterUrl?: string | null
  streamStatus?: VideoTelemetry['streamStatus']
  latencyMs?: number
}

export default function VideoPlayer({
  src,
  streamUrl,
  posterUrl,
  streamStatus,
  latencyMs = 42,
}: VideoPlayerProps) {
  if (liveKitConfigured()) {
    return <LiveKitCallerVideo latencyMs={latencyMs} posterUrl={posterUrl} />
  }

  return (
    <FallbackTelemetryVideo
      src={src}
      streamUrl={streamUrl}
      posterUrl={posterUrl}
      streamStatus={streamStatus}
      latencyMs={latencyMs}
    />
  )
}
