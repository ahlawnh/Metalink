import { useEffect, useState } from 'react'

/** Ticks on an interval so “live” surfaces can show wall-clock time. */
export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = window.setInterval(() => {
      setNow(new Date())
    }, intervalMs)
    return () => {
      window.clearInterval(id)
    }
  }, [intervalMs])

  return now
}
