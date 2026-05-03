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
 * Thick low buzz: sub-bass triangle + detuned squares through a lower band-pass,
 * lowshelf lift, and slow filter flutter — pushes phone speakers where they’re loudest.
 */
export function playCprBuzzPulse(ctx: AudioContext, opts?: BuzzPulseOptions): void {
  const durationSec = opts?.durationSec ?? 0.1;
  const peakGain = opts?.peakGain ?? 0.5;
  const freqHz = opts?.freqHz ?? 68;
  const t0 = opts?.startTime ?? ctx.currentTime;
  const stopAt = t0 + durationSec + 0.05;

  /** Lower harmonic band than before → more bass “honk”, less mid chirp. */
  const bpCenter = Math.min(310, Math.max(118, freqHz * 2.15));

  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(bpCenter, t0);
  bp.Q.setValueAtTime(5.4, t0);

  const flutter = ctx.createOscillator();
  flutter.type = "sine";
  flutter.frequency.setValueAtTime(36 + freqHz * 0.04, t0);
  const flutterDepth = ctx.createGain();
  flutterDepth.gain.setValueAtTime(Math.min(42, bpCenter * 0.16), t0);
  flutter.connect(flutterDepth);
  flutterDepth.connect(bp.frequency);

  const osc1 = ctx.createOscillator();
  osc1.type = "square";
  osc1.frequency.setValueAtTime(freqHz, t0);

  const osc2 = ctx.createOscillator();
  osc2.type = "square";
  osc2.frequency.setValueAtTime(freqHz * 2 + 2.2, t0);

  const g1 = ctx.createGain();
  const g2 = ctx.createGain();
  g1.gain.setValueAtTime(0.42, t0);
  g2.gain.setValueAtTime(0.26, t0);

  osc1.connect(g1);
  g1.connect(bp);
  osc2.connect(g2);
  g2.connect(bp);

  const lowshelf = ctx.createBiquadFilter();
  lowshelf.type = "lowshelf";
  lowshelf.frequency.setValueAtTime(185, t0);
  lowshelf.Q.setValueAtTime(0.7, t0);
  lowshelf.gain.setValueAtTime(11, t0);

  bp.connect(lowshelf);

  /** Half-frequency triangle → rumble phones can feel more than highs. */
  const subLp = ctx.createBiquadFilter();
  subLp.type = "lowpass";
  subLp.frequency.setValueAtTime(132, t0);
  subLp.Q.setValueAtTime(0.71, t0);

  const oscSub = ctx.createOscillator();
  oscSub.type = "triangle";
  oscSub.frequency.setValueAtTime(freqHz * 0.5, t0);
  const gSub = ctx.createGain();
  gSub.gain.setValueAtTime(0.39, t0);
  oscSub.connect(gSub);
  gSub.connect(subLp);

  const merge = ctx.createGain();
  lowshelf.connect(merge);
  subLp.connect(merge);

  const master = ctx.createGain();
  merge.connect(master);
  master.connect(ctx.destination);

  master.gain.setValueAtTime(0.0001, t0);
  master.gain.exponentialRampToValueAtTime(Math.max(0.0002, peakGain), t0 + 0.008);
  master.gain.exponentialRampToValueAtTime(0.0001, t0 + durationSec);

  flutter.start(t0);
  osc1.start(t0);
  osc2.start(t0);
  oscSub.start(t0);
  flutter.stop(stopAt);
  osc1.stop(stopAt);
  osc2.stop(stopAt);
  oscSub.stop(stopAt);
}
