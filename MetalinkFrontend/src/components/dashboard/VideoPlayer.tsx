import { useCallback, useEffect, useRef, useState } from 'react'

const MOCK_VIDEO_URL = 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4'

interface VideoPlayerProps {
  src?: string
  latencyMs?: number
}

export default function VideoPlayer({ src = MOCK_VIDEO_URL, latencyMs = 42 }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)

  const [isPlaying, setIsPlaying] = useState(true)
  const [isMuted, setIsMuted] = useState(true)

  const syncPlaying = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    setIsPlaying(!v.paused)
  }, [])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.defaultMuted = true
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    const onVolume = () => setIsMuted(video.muted || video.volume === 0)
    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('volumechange', onVolume)
    void video.play().catch(() => {})
    return () => {
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('volumechange', onVolume)
    }
  }, [src])

  const togglePlay = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      void v.play()
    } else {
      v.pause()
    }
    syncPlaying()
  }, [syncPlaying])

  const toggleMute = useCallback(() => {
    const v = videoRef.current
    if (!v) return
    v.muted = !v.muted
    if (!v.muted && v.volume === 0) {
      v.volume = 1
    }
    setIsMuted(v.muted)
  }, [])

  const toggleFullscreen = useCallback(() => {
    const root = shellRef.current
    if (!root) return
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      void root.requestFullscreen()
    }
  }, [])

  const ctrlBtn =
    'rounded-md bg-[var(--dash-surface-raised)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--dash-text-primary)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-white/[0.08] hover:bg-[color-mix(in_srgb,var(--dash-surface-raised)_92%,#fff)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dash-accent)]'

  return (
    <section className="dash-card w-full p-3">
      <div ref={shellRef} className="dash-inset relative aspect-video w-full overflow-hidden bg-[var(--dash-bg)]">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          src={src}
          autoPlay
          muted
          loop
          playsInline
          aria-label="Live bystander point-of-view video feed"
          onPlay={syncPlaying}
          onPause={syncPlaying}
        />

        {/* Native controls sit under overlays; explicit bar keeps targets reliable for dispatch UX. */}
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
          <span className="ml-auto font-data text-[11px] font-semibold tabular-nums text-[var(--dash-text-primary)]">
            Latency <span className="text-[var(--dash-accent)]">{latencyMs}</span> ms
          </span>
        </div>

        <div className="pointer-events-none absolute right-3 top-3 z-10">
          <span className="inline-flex items-center gap-2 rounded-full border border-red-500/85 bg-red-950/88 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-red-100 ring-1 ring-red-400/35">
            <span className="size-2 animate-pulse rounded-full bg-red-400" />
            Live POV
          </span>
        </div>
      </div>
    </section>
  )
}
