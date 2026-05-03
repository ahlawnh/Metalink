import { useEffect, useRef, useState } from 'react'

/** Resting to distress — BrPM is typically single digits–40+ in severe tachypnea. */
const RR_MIN = 4
const RR_MAX = 60

function clampRr(n: number): number {
  return Math.min(RR_MAX, Math.max(RR_MIN, n))
}

/** Same easing as BPM so RR digits drift smoothly between websocket snapshots. */
export function useSmoothedRr(targetRr: number, cueRevision: number): number {
  const safeTarget = clampRr(targetRr)

  const [displayed, setDisplayed] = useState(() => Math.round(safeTarget))
  const displayedRef = useRef(safeTarget)
  const targetRef = useRef(safeTarget)
  const prevTargetRef = useRef(safeTarget)
  const fastUntilRef = useRef(0)
  const lastRoundedRef = useRef(Math.round(safeTarget))
  const skipInitialCueRef = useRef(true)

  useEffect(() => {
    targetRef.current = clampRr(targetRr)
  }, [targetRr])

  useEffect(() => {
    const next = clampRr(targetRr)
    const prev = prevTargetRef.current
    if (Math.abs(next - prev) >= 2) {
      fastUntilRef.current = Math.max(fastUntilRef.current, performance.now() + 1150)
    }
    prevTargetRef.current = next
  }, [targetRr])

  useEffect(() => {
    if (skipInitialCueRef.current) {
      skipInitialCueRef.current = false
      return
    }
    fastUntilRef.current = Math.max(fastUntilRef.current, performance.now() + 950)
  }, [cueRevision])

  useEffect(() => {
    let id = 0
    const tick = () => {
      const target = targetRef.current
      let cur = displayedRef.current
      const diff = target - cur
      const now = performance.now()
      const urgent = Math.abs(diff) > 6
      const fastWindow = now < fastUntilRef.current
      const alpha = urgent || fastWindow ? 0.24 : 0.052

      if (Math.abs(diff) < 0.05) {
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
