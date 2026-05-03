/**
 * CPR metronome haptics via `navigator.vibrate` (Android / some desktop).
 * iOS Safari generally does not expose meaningful vibration — use `cprBuzzAudio` as fallback.
 */

export function cancelCprVibration(): void {
  try {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(0);
    }
  } catch {
    /* ignore */
  }
}

/** Pulse length for one compression cue from BPM (bounded). */
export function cprVibratePulseMsFromBpm(bpm: number): number {
  const periodMs = Math.round(60000 / Math.min(140, Math.max(60, bpm)));
  return Math.min(140, Math.max(55, Math.floor(periodMs * 0.28)));
}

/** Single compression cue; returns true if API ran (may still be ignored by OS). */
export function pulseCprVibration(bpm: number): boolean {
  try {
    if (typeof navigator === "undefined" || !navigator.vibrate) return false;
    const ms = cprVibratePulseMsFromBpm(bpm);
    navigator.vibrate(ms);
    return true;
  } catch {
    return false;
  }
}
