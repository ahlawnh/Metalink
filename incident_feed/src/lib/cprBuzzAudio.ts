/**
 * CPR metronome: low-frequency buzz pulses through the device speaker
 * (substitute for Vibration API when unsupported or ineffective).
 */

let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!sharedCtx) sharedCtx = new AC();
  return sharedCtx;
}

/** Required after load on many mobile browsers before audio can play. */
export async function resumeAudioContext(): Promise<AudioContext | null> {
  const ctx = getAudioContext();
  if (!ctx) return null;
  if (ctx.state === "suspended") {
    try {
      await ctx.resume();
    } catch {
      return ctx;
    }
  }
  return ctx;
}

export type BuzzPulseOptions = {
  /** Scheduled start time (AudioContext time). Default: now. */
  startTime?: number;
  /** Buzz length in seconds. */
  durationSec?: number;
  /** Peak gain (roughly perceived loudness). */
  peakGain?: number;
  /** Fundamental frequency (Hz); low = more “buzz”. */
  freqHz?: number;
};

/**
 * One short sawtooth burst + lowpass — reads as a tactile “buzz” through the speaker.
 */
export function playCprBuzzPulse(ctx: AudioContext, opts?: BuzzPulseOptions): void {
  const durationSec = opts?.durationSec ?? 0.09;
  const peakGain = opts?.peakGain ?? 0.22;
  const freqHz = opts?.freqHz ?? 74;
  const t0 = opts?.startTime ?? ctx.currentTime;
  const osc = ctx.createOscillator();
  const lp = ctx.createBiquadFilter();
  const g = ctx.createGain();

  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(freqHz, t0);

  lp.type = "lowpass";
  lp.frequency.setValueAtTime(280, t0);
  lp.Q.setValueAtTime(0.85, t0);

  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peakGain), t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec);

  osc.connect(lp);
  lp.connect(g);
  g.connect(ctx.destination);

  osc.start(t0);
  osc.stop(t0 + durationSec + 0.03);
}
