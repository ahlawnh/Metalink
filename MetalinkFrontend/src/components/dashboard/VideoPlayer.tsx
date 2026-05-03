import Draggable from 'react-draggable'
import { ConnectionState } from 'livekit-client'
import type { ReactElement } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLiveKitCallerVideo } from '@/hooks/useLiveKitCallerVideo'
import { cn } from '@/lib/utils'
import type { VideoTelemetry } from '@/types/dashboard'

const FALLBACK_CLIP = 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4'
const MUTED_STATUS_CHIP =
  'rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 font-data text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--dash-text-secondary)]'

/** Pop-out must render under `document.body` so dashboard `overflow-hidden` does not clip it while dragging. */
/** Fixed anchor only — react-draggable applies `transform` to its child; `fixed` + `transform` on one node breaks layout in Chromium/WebKit. */
const FLOATING_POPOUT_ANCHOR_CLASSES =
  'pointer-events-auto fixed left-[min(8vw,48px)] top-[min(14vh,120px)] z-[99999]'
/** Inner shell (gets translate). Grid rows reserve space for the video below the drag header. */
const FLOATING_POPOUT_SHELL_CLASSES =
  'relative box-border grid min-h-0 h-[420px] max-h-[92vh] min-w-[280px] max-w-[min(96vw,920px)] w-[min(440px,calc(100vw-24px))] grid-rows-[auto_minmax(240px,1fr)] gap-2 cursor-grab resize overflow-hidden rounded-xl shadow-[0_28px_90px_rgba(0,0,0,0.72)] ring-2 ring-[color-mix(in_srgb,#00E5FF_22%,transparent)] active:cursor-grabbing'

function DraggableVideoWrap({
  floating,
  dragNodeRef,
  dragPos,
  setDragPos,
  children,
}: {
  floating: boolean
  dragNodeRef: React.RefObject<HTMLElement | null>
  dragPos: { x: number; y: number }
  setDragPos: (p: { x: number; y: number }) => void
  children: ReactElement
}) {
  const draggableTree = (
    <Draggable
      nodeRef={dragNodeRef}
      disabled={!floating}
      handle=".video-drag-handle"
      cancel="button"
      position={floating ? dragPos : { x: 0, y: 0 }}
      onDrag={(_, data) => {
        if (floating) setDragPos({ x: data.x, y: data.y })
      }}
      onStop={(_, data) => {
        if (floating) setDragPos({ x: data.x, y: data.y })
      }}
    >
      {children}
    </Draggable>
  )

  if (!floating) return draggableTree
  if (typeof document === 'undefined') return null
  return createPortal(<div className={FLOATING_POPOUT_ANCHOR_CLASSES}>{draggableTree}</div>, document.body)
}

/** Use LiveKit feed when static URL+JWT are set, or when the Metalink API can mint a token (`VITE_TELEMETRY_API_ORIGIN`). */
function shouldUseLiveKit(): boolean {
  const u = typeof import.meta.env.VITE_LIVEKIT_URL === 'string' ? import.meta.env.VITE_LIVEKIT_URL.trim() : ''
  const t = typeof import.meta.env.VITE_LIVEKIT_TOKEN === 'string' ? import.meta.env.VITE_LIVEKIT_TOKEN.trim() : ''
  const origin =
    typeof import.meta.env.VITE_TELEMETRY_API_ORIGIN === 'string' ? import.meta.env.VITE_TELEMETRY_API_ORIGIN.trim() : ''
  return Boolean((u && t) || origin)
}

/** Fallback MP4 / progressive URL player driven by telemetry `video.streamUrl`. */
function FallbackTelemetryVideo({
  src,
  streamUrl,
  posterUrl,
  streamStatus = 'connected',
  wsLatencyMs = null,
  fillHeight = false,
}: {
  src?: string | null
  streamUrl?: string | null
  posterUrl?: string | null
  streamStatus?: VideoTelemetry['streamStatus']
  wsLatencyMs?: number | null
  fillHeight?: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const dragNodeRef = useRef<HTMLElement>(null)

  const [isPlaying, setIsPlaying] = useState(true)
  const [isMuted, setIsMuted] = useState(true)
  const [floating, setFloating] = useState(false)
  /** Controlled drag offset so docking clears react-draggable's transform (otherwise the card stays displaced). */
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 })
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
    if (document.fullscreenElement === root) void document.exitFullscreen()
    else void root.requestFullscreen()
  }, [])

  const dockFloating = useCallback(() => {
    setDragPos({ x: 0, y: 0 })
    setFloating(false)
  }, [])

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
        setDragPos({ x: 0, y: 0 })
        return
      } catch {
        setDragPos({ x: 0, y: 0 })
        setFloating(true)
        return
      }
    }

    setDragPos({ x: 0, y: 0 })
    setFloating(true)
  }, [floating, dockFloating])

  const ctrlBtn =
    'relative overflow-hidden rounded-md border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--dash-text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] transition-all hover:border-white/[0.14] hover:bg-white/[0.07] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent'

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
      className={cn(
        'dash-inset relative w-full overflow-hidden bg-[var(--dash-bg)]',
        floating ? 'min-h-0 h-full' : fillHeight ? 'min-h-0 flex-1' : 'aspect-video',
      )}
    >
      <video
        ref={videoRef}
        className={cn('h-full w-full object-cover', floating && 'min-h-[200px]')}
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
          WS latency{' '}
          <span className="text-[var(--dash-accent)]">
            {typeof wsLatencyMs === 'number' ? wsLatencyMs : '—'}
          </span>{' '}
          ms
        </span>
      </div>

      <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-col items-start gap-2">
        {showLivePov ? (
          <span className={cn('inline-flex items-center gap-2', MUTED_STATUS_CHIP)}>
            <span className="size-1.5 rounded-full bg-[var(--dash-text-secondary)]" />
            Live POV
          </span>
        ) : null}
        {showStreamChip ? (
          <span className={cn('pointer-events-none inline-flex items-center gap-2', MUTED_STATUS_CHIP)}>
            <span className="size-1.5 rounded-full bg-[var(--dash-text-secondary)]" />
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
        fillHeight && !floating && 'flex min-h-0 flex-1 flex-col',
        floating && FLOATING_POPOUT_SHELL_CLASSES,
      )}
    >
      <div
        className={cn(
          'video-drag-handle flex shrink-0 cursor-grab items-center gap-2 rounded-md bg-[var(--dash-surface-raised)] px-2 py-1.5 ring-1 ring-white/[0.08] active:cursor-grabbing',
          floating ? '' : 'mb-2 hidden',
        )}
      >
        <span className="dash-label normal-case tracking-normal text-[var(--dash-text-secondary)]">
          Floating feed · drag header · resize corner
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

      <DraggableVideoWrap floating={floating} dragNodeRef={dragNodeRef} dragPos={dragPos} setDragPos={setDragPos}>
        {cardBody}
      </DraggableVideoWrap>
    </>
  )
}

/** LiveKit: caller A/V in + operator mic out (camera never published). */
function LiveKitCallerVideo({
  wsLatencyMs = null,
  posterUrl,
  streamStatus = 'connected',
  fillHeight = false,
}: {
  wsLatencyMs?: number | null
  posterUrl?: string | null
  streamStatus?: VideoTelemetry['streamStatus']
  fillHeight?: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const dragNodeRef = useRef<HTMLElement>(null)

  const {
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
  } = useLiveKitCallerVideo(true, videoRef, audioRef)

  const displayLatencyMs = signalRttMs ?? wsLatencyMs ?? null

  const [isPlaying, setIsPlaying] = useState(true)
  /** Local speaker mute for the remote audio track (does not change caller's mic). */
  const [localSpeakerMuted, setLocalSpeakerMuted] = useState(false)
  const [floating, setFloating] = useState(false)
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 })
  const [pipActive, setPipActive] = useState(false)
  const [mediaPlaying, setMediaPlaying] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [callerAudioBlocked, setCallerAudioBlocked] = useState(false)
  const [callerAudioIssue, setCallerAudioIssue] = useState<string | null>(null)

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
    const root = shellRef.current
    const onFs = () => setIsFullscreen(root !== null && document.fullscreenElement === root)
    document.addEventListener('fullscreenchange', onFs)
    onFs()
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    a.muted = localSpeakerMuted
    if (!a.muted && a.volume === 0) a.volume = 1
  }, [hasRemoteAudio, connectionState, localSpeakerMuted])

  useEffect(() => {
    const onVol = () => {
      const a = audioRef.current
      if (!a) return
      setLocalSpeakerMuted(a.muted || a.volume === 0)
    }
    const a = audioRef.current
    if (!a) return
    a.addEventListener('volumechange', onVol)
    return () => a.removeEventListener('volumechange', onVol)
  }, [connectionState, hasRemoteAudio])

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

  const enableCallerAudio = useCallback(async () => {
    const a = audioRef.current
    if (!a) return
    a.muted = false
    if (a.volume === 0) a.volume = 1
    try {
      await a.play()
      setLocalSpeakerMuted(false)
      setCallerAudioBlocked(false)
      setCallerAudioIssue(null)
    } catch (e) {
      setCallerAudioBlocked(true)
      setCallerAudioIssue(
        e instanceof Error
          ? e.message
          : 'Browser blocked caller audio. Tap Unmute to try again.',
      )
    }
  }, [])

  const toggleSpeakerMute = useCallback(() => {
    const a = audioRef.current
    if (!a) return
    if (a.muted || a.volume === 0) {
      void enableCallerAudio()
      return
    }
    a.muted = true
    setLocalSpeakerMuted(true)
    setCallerAudioBlocked(false)
    setCallerAudioIssue(null)
  }, [enableCallerAudio])

  const toggleFullscreen = useCallback(() => {
    const root = shellRef.current
    if (!root) return
    if (document.fullscreenElement === root) void document.exitFullscreen()
    else void root.requestFullscreen()
  }, [])

  const dockFloating = useCallback(() => {
    setDragPos({ x: 0, y: 0 })
    setFloating(false)
  }, [])

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
        setDragPos({ x: 0, y: 0 })
        return
      } catch {
        setDragPos({ x: 0, y: 0 })
        setFloating(true)
        return
      }
    }

    setDragPos({ x: 0, y: 0 })
    setFloating(true)
  }, [floating, dockFloating])

  const ctrlBtn =
    'relative overflow-hidden rounded-md border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--dash-text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] transition-all hover:border-white/[0.14] hover:bg-white/[0.07] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/50 before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent'

  const pipSupported =
    typeof document !== 'undefined' &&
    'pictureInPictureEnabled' in document &&
    document.pictureInPictureEnabled !== false

  const rtcConnected = connectionState === ConnectionState.Connected
  const pipelineOk = streamStatus === 'connected'
  const signalHandshake =
    connectionState === ConnectionState.Connecting || connectionState === ConnectionState.Reconnecting
  const showOfflineChip = !rtcConnected && !isSessionLoading && !error && !signalHandshake

  const streamEstablished =
    rtcConnected &&
    hasRemoteVideo &&
    mediaPlaying &&
    pipelineOk &&
    !error &&
    !isSessionLoading
  const showLivePov = rtcConnected && hasRemoteVideo && mediaPlaying && pipelineOk
  const showStreamChip = streamEstablished

  const videoShell = (
    <div
      ref={shellRef}
      className={cn(
        'dash-inset relative w-full overflow-hidden bg-[var(--dash-bg)]',
        floating ? 'min-h-0 h-full' : fillHeight ? 'min-h-0 flex-1' : 'aspect-video',
      )}
    >
      {/*
        Video track only: keep this element muted so autoplay is allowed; caller audio is played via `<audio>` below.
      */}
      <video
        ref={videoRef}
        className={cn('h-full w-full object-cover', floating && 'min-h-[200px]')}
        poster={posterUrl ?? undefined}
        muted
        playsInline
        autoPlay
        aria-label="Live bystander point-of-view video feed (LiveKit)"
        onPlay={syncPlaying}
        onPause={syncPlaying}
      />

      <audio
        ref={audioRef}
        className="sr-only"
        aria-hidden
        autoPlay
        playsInline
        muted={localSpeakerMuted}
      />

      {isSessionLoading ? (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-[color-mix(in_srgb,var(--dash-bg)_88%,#000)] px-4 text-center">
          <p className="text-sm font-semibold text-[var(--dash-text-primary)]">Connecting to LiveKit…</p>
          <p className="max-w-sm text-xs text-[var(--dash-text-secondary)]">Resolving session token and joining room.</p>
        </div>
      ) : null}

      {error ? (
        <div className="pointer-events-none absolute left-3 right-3 top-12 z-10 rounded-md bg-[color-mix(in_srgb,#FF174428%,var(--dash-bg))] px-2 py-1.5 text-center text-[11px] font-medium text-[#FFAB91] ring-1 ring-[color-mix(in_srgb,#FF1744_35%,transparent)]">
          LiveKit: {error}
        </div>
      ) : null}

      <div className="absolute bottom-0 left-0 right-0 z-20 flex flex-wrap items-center gap-2 bg-[color-mix(in_srgb,var(--dash-bg)_92%,transparent)] px-3 py-2 backdrop-blur-sm">
        <button type="button" onClick={togglePlay} className={ctrlBtn}>
          {isPlaying ? 'Pause' : 'Play'}
        </button>
        <button
          type="button"
          onClick={toggleSpeakerMute}
          disabled={!hasRemoteAudio}
          title={
            !hasRemoteAudio
              ? 'No remote audio track yet'
              : remoteMicMuted
                ? 'Caller mic is muted at source'
                : undefined
          }
          className={cn(ctrlBtn, !hasRemoteAudio && 'opacity-45')}
        >
          {localSpeakerMuted ? 'Unmute' : 'Mute'}
        </button>
        <button
          type="button"
          onClick={() => void toggleOperatorMic()}
          title={
            operatorMicBlocked
              ? 'Microphone unavailable — allow access in the browser or check LiveKit token (publish mic).'
              : 'Push-to-console: speak to the caller over LiveKit'
          }
          className={cn(ctrlBtn, operatorMicBlocked && 'opacity-60')}
        >
          {operatorMicBlocked ? 'Mic blocked' : operatorMicEnabled ? 'TX off' : 'TX on'}
        </button>
        <button type="button" onClick={toggleFullscreen} className={ctrlBtn}>
          {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        </button>
        <button type="button" onClick={() => void handlePopOutClick()} className={ctrlBtn}>
          {pipActive ? 'Exit PiP' : floating ? 'Dock' : 'Pop-out'}
        </button>
        <span className="ml-auto font-data text-[11px] font-semibold tabular-nums text-[var(--dash-text-primary)]">
          RTT{' '}
          <span className="text-[var(--dash-accent)]">
            {typeof displayLatencyMs === 'number' ? displayLatencyMs : '—'}
          </span>{' '}
          ms
        </span>
      </div>

      <div className="pointer-events-none absolute left-3 top-3 z-10 flex max-w-[min(100%,20rem)] flex-col items-start gap-2">
        {showLivePov ? (
          <span className={cn('inline-flex items-center gap-2', MUTED_STATUS_CHIP)}>
            <span className="size-1.5 rounded-full bg-[var(--dash-text-secondary)]" />
            Live POV
          </span>
        ) : null}
        {signalHandshake && !isSessionLoading ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/60 bg-amber-950/75 px-2.5 py-1 font-data text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-100">
            <span className="size-1.5 animate-pulse rounded-full bg-amber-400" />
            RTC {connectionState === ConnectionState.Reconnecting ? 'reconnecting' : 'connecting'}
          </span>
        ) : null}
        {showOfflineChip ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-[var(--dash-bg)] px-2.5 py-1 font-data text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--dash-text-secondary)]">
            Signal offline
          </span>
        ) : null}
        {streamStatus === 'connecting' ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/50 bg-[color-mix(in_srgb,#FFB74D18%,var(--dash-bg))] px-2.5 py-1 font-data text-[10px] font-semibold uppercase tracking-[0.14em] text-[#FFE082]">
            Pipeline warming (telemetry)
          </span>
        ) : null}
        {remoteMicMuted ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-[var(--dash-surface-raised)] px-2.5 py-1 font-data text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--dash-text-secondary)]">
            Caller mic muted
          </span>
        ) : null}
        {hasRemoteAudio && callerAudioBlocked ? (
          <span
            className="pointer-events-auto inline-flex max-w-[18rem] items-center gap-2 rounded-md border border-amber-500/50 bg-[color-mix(in_srgb,#FFB74D18%,var(--dash-bg))] px-2.5 py-1 text-[10px] font-medium leading-snug text-[#FFE082]"
            title={callerAudioIssue ?? undefined}
          >
            Browser blocked audio. Tap Unmute.
          </span>
        ) : null}
        {localMicError ? (
          <span
            className="inline-flex max-w-[18rem] items-center gap-2 rounded-md border border-amber-500/50 bg-[color-mix(in_srgb,#FFB74D18%,var(--dash-bg))] px-2.5 py-1 text-[10px] font-medium leading-snug text-[#FFE082]"
            title={localMicError}
          >
            Dispatcher mic unavailable
          </span>
        ) : isLocalMicLive ? (
          <span className={cn('inline-flex items-center gap-2', MUTED_STATUS_CHIP)}>
            <span className="size-1.5 rounded-full bg-[var(--dash-text-secondary)]" />
            Dispatcher mic live
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-[var(--dash-bg)] px-2.5 py-1 font-data text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--dash-text-secondary)]">
            Dispatcher mic starting
          </span>
        )}
        {showStreamChip ? (
          <span className={cn('pointer-events-none inline-flex items-center gap-2', MUTED_STATUS_CHIP)}>
            <span className="size-1.5 rounded-full bg-[var(--dash-text-secondary)]" />
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
        fillHeight && !floating && 'flex min-h-0 flex-1 flex-col',
        floating && FLOATING_POPOUT_SHELL_CLASSES,
      )}
    >
      <div
        className={cn(
          'video-drag-handle flex shrink-0 cursor-grab items-center gap-2 rounded-md bg-[var(--dash-surface-raised)] px-2 py-1.5 ring-1 ring-white/[0.08] active:cursor-grabbing',
          floating ? '' : 'mb-2 hidden',
        )}
      >
        <span className="dash-label normal-case tracking-normal text-[var(--dash-text-secondary)]">
          Floating feed · drag header · resize corner
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

      <DraggableVideoWrap floating={floating} dragNodeRef={dragNodeRef} dragPos={dragPos} setDragPos={setDragPos}>
        {cardBody}
      </DraggableVideoWrap>
    </>
  )
}

interface VideoPlayerProps {
  src?: string | null
  streamUrl?: string | null
  posterUrl?: string | null
  streamStatus?: VideoTelemetry['streamStatus']
  /** Telemetry WebSocket RTT; LiveKit path prefers signal RTT when connected. */
  wsLatencyMs?: number | null
  /** Stretch video vertically to fill the dashboard column (drops fixed 16:9 letterboxing). */
  fillHeight?: boolean
}

export default function VideoPlayer({
  src,
  streamUrl,
  posterUrl,
  streamStatus,
  wsLatencyMs = null,
  fillHeight = false,
}: VideoPlayerProps) {
  const inner = shouldUseLiveKit() ? (
    <LiveKitCallerVideo
      wsLatencyMs={wsLatencyMs}
      posterUrl={posterUrl}
      streamStatus={streamStatus}
      fillHeight={fillHeight}
    />
  ) : (
    <FallbackTelemetryVideo
      src={src}
      streamUrl={streamUrl}
      posterUrl={posterUrl}
      streamStatus={streamStatus}
      wsLatencyMs={wsLatencyMs}
      fillHeight={fillHeight}
    />
  )

  if (!fillHeight) return inner

  return <div className="flex min-h-0 flex-1 flex-col">{inner}</div>
}
