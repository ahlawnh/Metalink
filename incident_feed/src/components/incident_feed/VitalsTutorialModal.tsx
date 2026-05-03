"use client";

import { useCallback, useState } from "react";

const STEPS = [
  {
    title: "Hold steady",
    body: "Support your phone or rest it so your face stays centered and still while we estimate vitals.",
  },
  {
    title: "Light your face",
    body: "Face the light or move to a brighter spot. Shadows and backlight make readings unreliable.",
  },
  {
    title: "Stay in frame",
    body: "Keep your whole face visible in the camera preview. Glasses and masks can reduce accuracy.",
  },
  {
    title: "Give it a few seconds",
    body: "Heart rate and breathing need several seconds of stable capture. Breathe normally—don’t hold your breath.",
  },
];

type VitalsTutorialModalProps = {
  open: boolean;
  onClose: () => void;
};

export function VitalsTutorialModal({ open, onClose }: VitalsTutorialModalProps) {
  const [step, setStep] = useState(0);

  const goNext = useCallback(() => {
    setStep((i) => Math.min(i + 1, STEPS.length - 1));
  }, []);

  const goPrev = useCallback(() => {
    setStep((i) => Math.max(i - 1, 0));
  }, []);

  const handleClose = useCallback(() => {
    setStep(0);
    onClose();
  }, [onClose]);

  if (!open) return null;

  const current = STEPS[step]!;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/55 p-4 pb-8 backdrop-blur-sm sm:items-center sm:pb-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="vitals-tutorial-title"
    >
      <div className="relative w-full max-w-md rounded-2xl bg-neutral-900/95 p-6 text-white shadow-2xl ring-1 ring-white/10 transition-all duration-300 ease-out">
        <h2 id="vitals-tutorial-title" className="text-lg font-semibold tracking-tight">
          Measuring vitals
        </h2>

        <div
          className="mt-4 min-h-[120px] touch-pan-y"
          onPointerDown={(e) => {
            (e.currentTarget as HTMLDivElement).dataset.x = String(e.clientX);
          }}
          onPointerUp={(e) => {
            const el = e.currentTarget as HTMLDivElement;
            const start = Number(el.dataset.x);
            if (Number.isFinite(start)) {
              const dx = e.clientX - start;
              if (dx < -40) goNext();
              if (dx > 40) goPrev();
            }
          }}
        >
          <p className="text-sm font-medium text-amber-200/90">{current.title}</p>
          <p className="mt-2 text-sm leading-relaxed text-neutral-300">{current.body}</p>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={goPrev}
            disabled={step === 0}
            className="rounded-full px-4 py-2 text-sm font-medium text-neutral-400 hover:text-white disabled:opacity-30"
          >
            Back
          </button>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={goNext}
              className="rounded-full bg-white/10 px-5 py-2 text-sm font-semibold text-white ring-1 ring-white/20 hover:bg-white/15"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={handleClose}
              className="rounded-full bg-emerald-500 px-5 py-2 text-sm font-semibold text-neutral-950 hover:bg-emerald-400"
            >
              Got it
            </button>
          )}
        </div>

        <div className="mt-5 flex justify-center gap-2">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-2 w-2 rounded-full transition-colors duration-300 ${
                i === step ? "bg-white" : "bg-white/25"
              }`}
              aria-hidden
            />
          ))}
        </div>

        <button
          type="button"
          onClick={handleClose}
          className="absolute right-4 top-4 rounded-full p-1 text-neutral-500 hover:bg-white/10 hover:text-white"
          aria-label="Close"
        >
          <span aria-hidden className="text-lg leading-none">
            ×
          </span>
        </button>
      </div>
    </div>
  );
}
