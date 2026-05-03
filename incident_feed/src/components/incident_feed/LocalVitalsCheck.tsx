"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useRppgVitals } from "@/hooks/useRppgVitals";

type LocalVitalsCheckProps = {
  onClose: () => void;
};

/**
 * Standalone local-only vitals prototype (own getUserMedia stream).
 * Call UI uses the same rPPG hook against the LiveKit local `<video>`.
 */
export default function LocalVitalsCheck({ onClose }: LocalVitalsCheckProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const vitals = useRppgVitals(videoRef, { active: true, paused: false });

  const stopAll = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const handleClose = useCallback(() => {
    stopAll();
    onClose();
  }, [onClose, stopAll]);

  const [statusNote, setStatusNote] = useState("Starting camera…");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "environment",
            width: { ideal: 640 },
            height: { ideal: 480 },
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setStatusNote("Camera ready — processing uses LocalVitalsCheck modal.");
      } catch (e) {
        if (!cancelled) {
          setStatusNote(
            e instanceof Error ? e.message : "Could not start local camera."
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      stopAll();
    };
  }, [stopAll]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="vitals-proto-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/10">
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <h2 id="vitals-proto-title" className="text-lg font-semibold text-neutral-900">
            Local vitals prototype
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-800"
          >
            Close
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
          <p className="text-xs leading-relaxed text-neutral-500">
            Demo only: raw green → Z-score → Hamming → FFT (0.7–2.0 Hz, resting).
            SNR gate before display. Not a medical device.
          </p>

          {vitals.error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{vitals.error}</p>
          ) : null}

          <div className="relative overflow-hidden rounded-xl bg-neutral-950">
            <video
              ref={videoRef}
              className="aspect-video w-full object-cover opacity-90"
              playsInline
              muted
              autoPlay
            />
            <p className="absolute bottom-2 left-2 right-2 rounded bg-black/55 px-2 py-1 text-center text-[11px] text-white/90">
              {vitals.status || statusNote}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-center">
              <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                Heart rate (est.)
              </p>
              <div className="mt-1 min-h-[2.25rem] font-semibold tabular-nums text-neutral-900">
                {vitals.bpmAnalyzing ? (
                  <span className="text-lg font-medium leading-snug text-neutral-600">
                    Analyzing Signal...
                  </span>
                ) : (
                  <span className="text-3xl">{vitals.bpmDisplay > 0 ? vitals.bpmDisplay : "—"}</span>
                )}
              </div>
              <p className="text-[10px] text-neutral-400">BPM</p>
            </div>
            <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-center">
              <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
                Breathing (est.)
              </p>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-neutral-900">
                {vitals.rr > 0 ? vitals.rr : "—"}
              </p>
              <p className="text-[10px] text-neutral-400">breaths / min</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Button + visibility only — does not touch call / LiveKit / API clients. */
export function VitalsPrototypeLauncher() {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col items-start gap-3">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-800 shadow-sm hover:bg-neutral-50"
      >
        Test Local Vitals
      </button>
      {open ? <LocalVitalsCheck onClose={() => setOpen(false)} /> : null}
    </div>
  );
}
