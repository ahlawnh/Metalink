import { useEffect, useRef, useState } from 'react'

const BPM_MIN = 35
const BPM_MAX = 220

function clampBpm(n: number): number {
  return Math.min(BPM_MAX, Math.max(BPM_MIN, n))
}

/**
 * Eases displayed BPM toward telemetry-driven targets so digits drift steadily instead of snapping.
 * Accelerates briefly when telemetry jumps (camera/RPPG pushed a new estimate) or when the caller-input
 * fuse revision bumps — placeholder until real camera-derived cues drive `callerCueRevision`.
 */
export function useSmoothedBpm(targetBpm: number, callerCueRevision: number): number {
  const safeTarget = clampBpm(targetBpm)

  const [displayed, setDisplayed] = useState(() => Math.round(safeTarget))
  const displayedRef = useRef(safeTarget)
  const targetRef = useRef(safeTarget)
  const prevTargetRef = useRef(safeTarget)
  const fastUntilRef = useRef(0)
  const lastRoundedRef = useRef(Math.round(safeTarget))
  const skipInitialCueRef = useRef(true)

  useEffect(() => {
    targetRef.current = clampBpm(targetBpm)
  }, [targetBpm])

  useEffect(() => {
    const next = clampBpm(targetBpm)
    const prev = prevTargetRef.current
    if (Math.abs(next - prev) >= 3) {
      fastUntilRef.current = Math.max(fastUntilRef.current, performance.now() + 1150)
    }
    prevTargetRef.current = next
  }, [targetBpm])

  useEffect(() => {
    if (skipInitialCueRef.current) {
      skipInitialCueRef.current = false
      return
    }
    fastUntilRef.current = Math.max(fastUntilRef.current, performance.now() + 950)
  }, [callerCueRevision])

  useEffect(() => {
    let id = 0
    const tick = () => {
      const target = targetRef.current
      let cur = displayedRef.current
      const diff = target - cur
      const now = performance.now()
      const urgent = Math.abs(diff) > 18
      const fastWindow = now < fastUntilRef.current
      const alpha = urgent || fastWindow ? 0.26 : 0.055

      if (Math.abs(diff) < 0.06) {
        cur = target
      } else {
        cur += diff * alpha
      }

      displayedRef.current = cur
      const rounded = Math.round(cur)
      if (rounded !== lastRoundedRef.current) {
        lastRoundedRef.current = rounded
        setDisplayed(rounded)
      }

      id = requestAnimationFrame(tick)
    }

    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [])

  return displayed
}
