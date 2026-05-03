"use client";

import type { IncidentCprHapticCue } from "@/hooks/useIncidentCprHapticListener";
import { useCallback, useEffect, useRef, useState } from "react";

type Phase = "hidden" | "intro" | "countdown" | "vibrating";

type Props = {
  cue: IncidentCprHapticCue;
};

export function CprDispatcherGuidance({ cue }: Props) {
  const [phase, setPhase] = useState<Phase>("hidden");
  const [countdown, setCountdown] = useState(5);
  const [activeBpm, setActiveBpm] = useState<number | null>(null);
  const vibrateIntervalRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const prevOnRef = useRef(false);
  const bpmRef = useRef(110);

  const clearVibrate = useCallback(() => {
    if (vibrateIntervalRef.current !== null) {
      window.clearInterval(vibrateIntervalRef.current);
      vibrateIntervalRef.current = null;
    }
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(0);
    }
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
      clearVibrate();
      setPhase("hidden");
      setActiveBpm(null);
      return;
    }

    bpmRef.current = cue.bpm;

    if (!prevOnRef.current) {
      prevOnRef.current = true;
      clearCountdown();
      clearVibrate();
      setActiveBpm(cue.bpm);
      setPhase("intro");
      setCountdown(5);
      return;
    }

    setActiveBpm(cue.bpm);
  }, [cue, clearCountdown, clearVibrate]);

  useEffect(() => {
    if (phase !== "vibrating" || activeBpm === null) return;
    const periodMs = Math.round(60000 / activeBpm);
    const pulseMs = Math.min(140, Math.max(60, Math.floor(periodMs * 0.28)));
    navigator.vibrate?.(pulseMs);
    const id = window.setInterval(() => {
      navigator.vibrate?.(pulseMs);
    }, periodMs);
    vibrateIntervalRef.current = id;
    return () => {
      window.clearInterval(id);
      vibrateIntervalRef.current = null;
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(0);
      }
    };
  }, [phase, activeBpm]);

  useEffect(() => {
    return () => {
      clearCountdown();
      clearVibrate();
    };
  }, [clearCountdown, clearVibrate]);

  const startMetronome = useCallback((bpm: number) => {
    bpmRef.current = bpm;
    setActiveBpm(bpm);
    setPhase("vibrating");
  }, []);

  const onUnderstood = useCallback(() => {
    navigator.vibrate?.(40);
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
                  Put this phone somewhere on your body where you can clearly feel
                  vibrations — for example a pocket against your hip or a shirt
                  pocket on your chest.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="font-semibold text-emerald-400">2.</span>
                <span>
                  Perform CPR according to the vibrations: after the countdown,
                  each pulse is when to push on the chest — stay on that steady beat.
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
              Vibrations will start in {countdown} second{countdown === 1 ? "" : "s"}.
            </p>
            <p
              className="mt-6 font-data text-7xl font-bold tabular-nums text-emerald-400"
              aria-live="assertive"
            >
              {countdown > 0 ? countdown : "—"}
            </p>
            <p className="mt-4 text-xs text-white/55">
              Keep the phone in place so you feel each pulse.
            </p>
          </>
        ) : null}

        {phase === "vibrating" && activeBpm ? (
          <>
            <p className="text-lg font-semibold text-white">Compress with each vibration</p>
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
