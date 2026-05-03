/** FFT buffer length (uniform resample); power-of-two friendly for bin spacing. */
export const RPPG_FFT_SIZE = 512;

/** Raw green buffer span for FFT BPM (resting). */
export const RPPG_WINDOW_SEC_BPM = 10;

/** RR estimate window (autocorr path). */
export const RPPG_RR_WINDOW_SEC = 8;

/** Frequency band for resting BPM (42–120 BPM). */
export const RPPG_BAND_LOW_HZ = 0.7;
export const RPPG_BAND_HIGH_HZ = 2.0;

/** Dominant-peak SNR gate. */
export const RPPG_SNR_THRESHOLD = 1.5;

/** Moving median length for displayed BPM. */
export const RPPG_BPM_MEDIAN_WINDOW = 7;

export type RppgSample = { t: number; g: number };

export function detrend(signal: number[]): number[] {
  if (signal.length === 0) return [];
  const m = signal.reduce((a, b) => a + b, 0) / signal.length;
  return signal.map((v) => v - m);
}

/** Rough rate (breaths/min or beats/min) from autocorrelation peak in plausible period range. */
export function estimateRateFromSignal(
  samples: RppgSample[],
  minRate: number,
  maxRate: number
): number {
  if (samples.length < 40) return 0;
  const dt =
    (samples[samples.length - 1]!.t - samples[0]!.t) /
    Math.max(1, samples.length - 1);
  if (dt <= 0 || dt > 0.5) return 0;

  const sig = detrend(samples.map((s) => s.g));
  const n = sig.length;
  const minLag = Math.max(2, Math.floor(60 / maxRate / dt));
  const maxLag = Math.min(Math.floor(n / 2), Math.ceil(60 / minRate / dt));

  let bestLag = 0;
  let bestScore = -Infinity;
  for (let L = minLag; L <= maxLag; L++) {
    let acc = 0;
    for (let i = L; i < n; i++) acc += sig[i]! * sig[i - L]!;
    if (acc > bestScore) {
      bestScore = acc;
      bestLag = L;
    }
  }
  if (bestLag <= 0 || bestScore <= 0) return 0;
  const periodSec = bestLag * dt;
  return 60 / periodSec;
}

export function zScore(values: number[]): number[] {
  const n = values.length;
  if (n === 0) return [];
  const mean = values.reduce((a, b) => a + b, 0) / n;
  let varSum = 0;
  for (const v of values) varSum += (v - mean) ** 2;
  const std = Math.sqrt(varSum / n) || 1e-9;
  return values.map((v) => (v - mean) / std);
}

export function hamming(n: number): number[] {
  const w: number[] = [];
  if (n === 1) return [1];
  for (let i = 0; i < n; i++) {
    w.push(0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (n - 1)));
  }
  return w;
}

/** Uniform resample of raw green channel for FFT (linear time). */
export function resampleUniform(
  samples: RppgSample[],
  targetN: number
): { values: number[]; fs: number } | null {
  if (samples.length < 2 || targetN < 64) return null;
  const sorted = [...samples].sort((a, b) => a.t - b.t);
  const t0 = sorted[0]!.t;
  const t1 = sorted[sorted.length - 1]!.t;
  const dur = t1 - t0;
  if (dur <= 0.4) return null;

  const values: number[] = [];
  for (let i = 0; i < targetN; i++) {
    const u = i / (targetN - 1);
    const tt = t0 + u * dur;
    let j = 0;
    while (j < sorted.length - 1 && sorted[j + 1]!.t < tt) j++;
    const p0 = sorted[j]!;
    const p1 = sorted[j + 1] ?? p0;
    const denom = Math.max(1e-9, p1.t - p0.t);
    const alpha = (tt - p0.t) / denom;
    values.push(p0.g + alpha * (p1.g - p0.g));
  }
  const fs = (targetN - 1) / dur;
  return { values, fs };
}

/** Single DFT bin (integer k). */
export function dftBinK(x: number[], k: number): { re: number; im: number } {
  const N = x.length;
  let re = 0;
  let im = 0;
  const theta0 = (-2 * Math.PI * k) / N;
  for (let n = 0; n < N; n++) {
    const a = theta0 * n;
    re += x[n]! * Math.cos(a);
    im += x[n]! * Math.sin(a);
  }
  return { re, im };
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((x, y) => x - y);
  const m = Math.floor((s.length - 1) / 2);
  if (s.length % 2 === 1) return s[m] ?? 0;
  return ((s[m] ?? 0) + (s[m + 1] ?? 0)) / 2;
}

/** Z-score raw green → Hamming → DFT magnitudes in band → peak BPM + SNR. */
export function estimateBpmFft(buf: RppgSample[], nowSec: number): {
  bpm: number;
  snr: number;
  ok: boolean;
} {
  const windowStart = nowSec - RPPG_WINDOW_SEC_BPM;
  const slice = buf.filter((s) => s.t >= windowStart && s.t <= nowSec);
  if (slice.length < 48) return { bpm: 0, snr: 0, ok: false };

  const resampled = resampleUniform(slice, RPPG_FFT_SIZE);
  if (!resampled) return { bpm: 0, snr: 0, ok: false };

  const z = zScore(resampled.values);
  const win = hamming(RPPG_FFT_SIZE);
  const zw = z.map((v, i) => v * (win[i] ?? 1));

  const { fs } = resampled;
  const N = zw.length;
  const kLow = Math.max(1, Math.ceil((RPPG_BAND_LOW_HZ * N) / fs));
  const kHigh = Math.min(
    Math.floor(N / 2),
    Math.floor((RPPG_BAND_HIGH_HZ * N) / fs)
  );
  if (kHigh <= kLow) return { bpm: 0, snr: 0, ok: false };

  const mags: number[] = [];
  for (let k = kLow; k <= kHigh; k++) {
    const { re, im } = dftBinK(zw, k);
    mags.push(Math.hypot(re, im));
  }

  let peakI = 0;
  let peakVal = -Infinity;
  for (let i = 0; i < mags.length; i++) {
    if (mags[i]! > peakVal) {
      peakVal = mags[i]!;
      peakI = i;
    }
  }

  const kPeak = kLow + peakI;
  const fPeak = (kPeak * fs) / N;
  const bpm = fPeak * 60;

  const others = mags.filter((_, idx) => idx !== peakI);
  const noiseFloor =
    others.length > 0 ? median(others) : Math.max(peakVal * 0.1, 1e-12);
  const snr = peakVal / (noiseFloor + 1e-12);

  const inBand = bpm >= 42 && bpm <= 120;
  const ok = snr > RPPG_SNR_THRESHOLD && inBand;
  return { bpm, snr, ok };
}
