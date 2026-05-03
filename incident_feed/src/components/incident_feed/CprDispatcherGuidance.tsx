"use client";

import type { IncidentCprHapticCue } from "@/hooks/useIncidentCprHapticListener";
import { playCprBuzzPulse, resumeAudioContext } from "@/lib/cprBuzzAudio";
import {
  cancelCprVibration,
  pulseCprVibration,
} from "@/lib/cprVibrate";
import { useCallback, useEffect, useRef, useState } from "react";

type Phase = "hidden" | "opt_in" | "intro" | "countdown" | "vibrating";

type Props = {
  cue: IncidentCprHapticCue;
};

export function CprDispatcherGuidance({ cue }: Props) {
  const [phase, setPhase] = useState<Phase>("hidden");
  const [countdown, setCountdown] = useState(5);
  const [activeBpm, setActiveBpm] = useState<number | null>(null);
  const buzzIntervalRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const prevOnRef = useRef(false);
  const bpmRef = useRef(110);

  const clearBuzz = useCallback(() => {
    if (buzzIntervalRef.current !== null) {
      window.clearInterval(buzzIntervalRef.current);
      buzzIntervalRef.current = null;
    }
    cancelCprVibration();
  }, []);

  const clearCountdown = useCallback(() => {
    if (countdownTimerRef.current !== null) {
      window.clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const on = cue.kind === "on";
    if (!on) {
      prevOnRef.current = false;
      clearCountdown();
      clearBuzz();
      setPhase("hidden");
      setActiveBpm(null);
      return;
    }

    bpmRef.current = cue.bpm;

    if (!prevOnRef.current) {
      prevOnRef.current = true;
      clearCountdown();
      clearBuzz();
      setActiveBpm(cue.bpm);
      // Must not play audio here — mobile Safari blocks sound until the user taps (see opt-in step).
      setPhase("opt_in");
      setCountdown(5);
      return;
    }

    setActiveBpm(cue.bpm);
  }, [cue, clearCountdown, clearBuzz]);

  useEffect(() => {
    if (phase !== "vibrating" || activeBpm === null) return;
    let cancelled = false;

    void resumeAudioContext().then((ctx) => {
      if (cancelled || !ctx) return;
      const periodMs = Math.round(60000 / activeBpm);
      pulseCprVibration(activeBpm);
      playCprBuzzPulse(ctx);
      if (cancelled) return;
      const id = window.setInterval(() => {
        pulseCprVibration(activeBpm);
        playCprBuzzPulse(ctx);
      }, periodMs);
      if (cancelled) {
        window.clearInterval(id);
        return;
      }
      buzzIntervalRef.current = id;
    });

    return () => {
      cancelled = true;
      if (buzzIntervalRef.current !== null) {
        window.clearInterval(buzzIntervalRef.current);
        buzzIntervalRef.current = null;
      }
      cancelCprVibration();
    };
  }, [phase, activeBpm]);

  useEffect(() => {
    return () => {
      clearCountdown();
      clearBuzz();
    };
  }, [clearCountdown, clearBuzz]);

  const startMetronome = useCallback((bpm: number) => {
    bpmRef.current = bpm;
    setActiveBpm(bpm);
    setPhase("vibrating");
  }, []);

  const onDeclineMetronome = useCallback(() => {
    clearCountdown();
    clearBuzz();
    setPhase("hidden");
  }, [clearBuzz, clearCountdown]);

  /** User gesture: unlock Web Audio + sample buzz, then instructions. */
  const onAcceptMetronome = useCallback(async () => {
    const ctx = await resumeAudioContext();
    if (ctx) {
      playCprBuzzPulse(ctx, {
        peakGain: 0.2,
        durationSec: 0.09,
        freqHz: 72,
      });
    }
    setPhase("intro");
  }, []);

  const onUnderstood = useCallback(() => {
    pulseCprVibration(bpmRef.current);
    void resumeAudioContext().then((ctx) => {
      if (ctx)
        playCprBuzzPulse(ctx, {
          peakGain: 0.34,
          durationSec: 0.075,
          freqHz: 74,
        });
    });
    setPhase("countdown");
    setCountdown(5);
    clearCountdown();
    countdownTimerRef.current = window.setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          if (countdownTimerRef.current !== null) {
            window.clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          const bpm = bpmRef.current;
          queueMicrotask(() => startMetronome(bpm));
          return 0;
        }
        return c - 1;
      });
    }, 1000);
  }, [clearCountdown, startMetronome]);

  if (phase === "hidden") {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 px-6 py-10 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cpr-guidance-title"
    >
      <div className="max-w-md rounded-2xl border border-white/15 bg-neutral-900 p-6 text-center shadow-2xl">
        {phase === "opt_in" ? (
          <>
            <h2
              id="cpr-guidance-title"
              className="text-lg font-semibold tracking-tight text-white"
            >
              CPR speaker metronome?
            </h2>
            <p className="mt-3 text-left text-sm leading-relaxed text-white/85">
              Dispatch wants to send compression tempo cues as low-frequency buzzes through this
              phone&apos;s speaker. Your browser only allows that after you tap to confirm.
            </p>
            <p className="mt-3 text-left text-xs leading-snug text-amber-200/90">
              Turn volume up first. Tap &quot;Allow sound&quot; — you should hear one short test buzz.
            </p>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={onDeclineMetronome}
                className="w-full rounded-xl border border-white/20 bg-transparent px-4 py-3 text-sm font-semibold text-white/85 hover:bg-white/10 sm:w-auto sm:min-w-[8rem]"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={() => void onAcceptMetronome()}
                className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-neutral-950 hover:bg-emerald-400 sm:w-auto sm:min-w-[10rem]"
              >
                Allow sound
              </button>
            </div>
          </>
        ) : null}

        {phase === "intro" ? (
          <>
            <h2
              id="cpr-guidance-title"
              className="text-lg font-semibold tracking-tight text-white"
            >
              Dispatcher: chest compressions
            </h2>
            <ol className="mt-4 space-y-3 text-left text-sm leading-relaxed text-white/90">
              <li className="flex gap-2">
                <span className="font-semibold text-emerald-400">1.</span>
                <span>
                  Put the phone in a pocket or against your body where you can feel
                  vibrations <span className="text-white/70">(Android)</span> or hear the
                  buzz through the speaker <span className="text-white/70">(iPhone)</span>.
                  Turn volume up if you rely on sound.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-emerald-400">2.</span>
                <span>
                  After the countdown, each vibration or buzz marks when to compress —
                  stay on that steady beat.
                </span>
              </li>
            </ol>
            <button
              type="button"
              onClick={onUnderstood}
              className="mt-6 w-full rounded-xl bg-emerald-500 py-3 text-sm font-semibold text-neutral-950 hover:bg-emerald-400"
            >
              I understand
            </button>
          </>
        ) : null}

        {phase === "countdown" ? (
          <>
            <p className="text-base font-medium text-white">
              Vibrations / buzz will start in {countdown} second
              {countdown === 1 ? "" : "s"}.
            </p>
            <p
              className="mt-6 font-data text-7xl font-bold tabular-nums text-emerald-400"
              aria-live="assertive"
            >
              {countdown > 0 ? countdown : "—"}
            </p>
            <p className="mt-4 text-xs text-white/55">
              Keep the phone positioned so you feel each pulse or hear each buzz.
            </p>
          </>
        ) : null}

        {phase === "vibrating" && activeBpm ? (
          <>
            <p className="text-lg font-semibold text-white">
              Compress with each vibration / buzz
            </p>
            <p className="mt-2 text-sm text-white/75">
              Tempo: <span className="font-data tabular-nums text-emerald-400">{activeBpm}</span>{" "}
              compressions per minute
            </p>
            <p className="mt-4 text-xs text-white/50">
              The dispatcher can stop the metronome remotely when it is time to pause.
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
