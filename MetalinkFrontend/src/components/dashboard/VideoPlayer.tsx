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

  return (
    <section className="w-full rounded-xl border border-zinc-700 bg-zinc-900 p-3 shadow-md shadow-black/25">
      <div
        ref={shellRef}
        className="relative aspect-video w-full overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950"
      >
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
        <div className="absolute bottom-0 left-0 right-0 z-20 flex flex-wrap items-center gap-2 bg-zinc-950/92 px-3 py-2">
          <button
            type="button"
            onClick={togglePlay}
            className="rounded-md border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-100 hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <button
            type="button"
            onClick={toggleMute}
            className="rounded-md border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-100 hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            {isMuted ? 'Unmute' : 'Mute'}
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="rounded-md border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-100 hover:bg-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400"
          >
            Fullscreen
          </button>
          <span className="ml-auto text-xs font-medium tabular-nums text-zinc-400">Latency {latencyMs}ms</span>
        </div>

        <div className="pointer-events-none absolute right-3 top-3 z-10">
          <span className="inline-flex items-center gap-2 rounded-full border border-red-500/70 bg-red-950/80 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-red-100">
            <span className="size-2 animate-pulse rounded-full bg-red-400" />
            Live POV
          </span>
        </div>
      </div>
    </section>
  )
}
