"use client";

import type { IncidentCprHapticCue } from "@/hooks/useIncidentCprHapticListener";
import { playCprBuzzPulse, resumeAudioContext } from "@/lib/cprBuzzAudio";
import {
  cancelCprVibration,
  pulseCprVibration,
} from "@/lib/cprVibrate";
import { useCallback, useEffect, useRef, useState } from "react";

type Phase = "hidden" | "intro" | "countdown" | "vibrating";

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
      setPhase("intro");
      setCountdown(5);
      pulseCprVibration(cue.bpm);
      void resumeAudioContext().then((ctx) => {
        if (ctx) {
          playCprBuzzPulse(ctx, {
            peakGain: 0.52,
            durationSec: 0.1,
            freqHz: 66,
          });
        }
      });
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
