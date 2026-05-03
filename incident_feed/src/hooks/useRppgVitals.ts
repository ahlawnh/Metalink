"use client";

import type { FaceMesh } from "@mediapipe/face_mesh";
import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  estimateBpmFft,
  estimateRateFromSignal,
  median,
  type RppgSample,
  RPPG_BPM_MEDIAN_WINDOW,
  RPPG_RR_WINDOW_SEC,
} from "@/lib/rppg";

const MEDIAPIPE_CDN =
  "https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619";

export type RppgVitalsState = {
  bpmDisplay: number;
  bpmAnalyzing: boolean;
  rr: number;
  status: string;
  error: string | null;
};

const IDLE: RppgVitalsState = {
  bpmDisplay: 0,
  bpmAnalyzing: true,
  rr: 0,
  status: "",
  error: null,
};

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

/**
 * rPPG vitals from an existing `<video>` (e.g. LiveKit local preview or getUserMedia).
 * `paused` gates processing without tearing down Face Mesh (e.g. tutorial overlay).
 */
export function useRppgVitals(
  videoRef: RefObject<HTMLVideoElement | null>,
  options: { active: boolean; paused: boolean }
): RppgVitalsState {
  const { active } = options;
  const optsRef = useRef(options);
  optsRef.current = options;

  const samplesRef = useRef<RppgSample[]>([]);
  const bpmRawHistoryRef = useRef<number[]>([]);
  const rafRef = useRef<number>(0);
  const faceMeshRef = useRef<FaceMesh | null>(null);
  const lastProcessRef = useRef(0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastGoodRrRef = useRef(0);

  const [state, setState] = useState<RppgVitalsState>(IDLE);

  useEffect(() => {
    if (!active) {
      setState(IDLE);
      return;
    }

    let cancelled = false;
    canvasRef.current = document.createElement("canvas");

    const tickMetrics = () => {
      if (optsRef.current.paused || cancelled) return;
      const buf = samplesRef.current;
      const now = performance.now() / 1000;
      const rrRecent = buf.filter((s) => s.t > now - RPPG_RR_WINDOW_SEC);
      const rrEst = estimateRateFromSignal(rrRecent, 6, 32);
      const rrRounded = Math.round(rrEst * 10) / 10;
      const rrValid = Number.isFinite(rrRounded) && rrRounded >= 6 && rrRounded <= 40;
      if (rrValid) {
        lastGoodRrRef.current = rrRounded;
      }
      const rrDisplay = rrValid ? rrRounded : lastGoodRrRef.current;

      const fft = estimateBpmFft(buf, now);
      const hist = bpmRawHistoryRef.current;

      if (fft.ok && fft.bpm > 0) {
        hist.push(Math.round(fft.bpm));
        while (hist.length > RPPG_BPM_MEDIAN_WINDOW) hist.shift();
        const smoothed = median(hist);
        setState((s) => ({
          ...s,
          bpmDisplay: Math.round(smoothed),
          bpmAnalyzing: false,
          rr: rrDisplay > 0 ? rrDisplay : s.rr,
        }));
      } else {
        setState((s) => ({
          ...s,
          bpmAnalyzing: true,
          rr: rrDisplay > 0 ? rrDisplay : s.rr,
        }));
      }
    };

    const interval = window.setInterval(tickMetrics, 600);

    (async () => {
      setState((s) => ({
        ...s,
        error: null,
        status: "Waiting for camera…",
      }));

      for (let i = 0; i < 300 && !cancelled; i++) {
        const v = videoRef.current;
        if (v && v.videoWidth > 0) break;
        await sleep(100);
      }

      const video = videoRef.current;
      if (cancelled || !video?.videoWidth) {
        if (!cancelled) {
          setState((s) => ({
            ...s,
            error: "Camera video not ready.",
            status: "",
          }));
        }
        return;
      }

      setState((s) => ({
        ...s,
        status: "Loading face tracker…",
      }));

      try {
        const { FaceMesh: FaceMeshCtor } = await import("@mediapipe/face_mesh");
        if (cancelled) return;

        const faceMesh = new FaceMeshCtor({
          locateFile: (file: string) => `${MEDIAPIPE_CDN}/${file}`,
        });
        faceMesh.setOptions({
          maxNumFaces: 1,
          refineLandmarks: true,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        faceMeshRef.current = faceMesh;

        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d", { willReadFrequently: true });
        if (!canvas || !ctx) {
          setState((s) => ({ ...s, error: "Canvas not available." }));
          return;
        }

        faceMesh.onResults((results) => {
          if (
            cancelled ||
            optsRef.current.paused ||
            !videoRef.current?.videoWidth
          )
            return;
          const videoEl = videoRef.current;
          const w = videoEl.videoWidth;
          const h = videoEl.videoHeight;
          canvas.width = 64;
          canvas.height = 64;

          const lm = results.multiFaceLandmarks?.[0];
          if (!lm || lm.length < 10) return;

          let minX = 1,
            maxX = 0,
            minY = 1,
            maxY = 0;
          for (const p of lm) {
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y);
            maxY = Math.max(maxY, p.y);
          }
          const boxW = (maxX - minX) * w;
          const boxH = (maxY - minY) * h;
          const fx = minX * w;
          const fy = minY * h + boxH * 0.05;
          const fw = Math.max(32, boxW * 0.85);
          const fh = Math.max(24, boxH * 0.32);

          ctx.drawImage(videoEl, fx, fy, fw, fh, 0, 0, 64, 64);
          const img = ctx.getImageData(0, 0, 64, 64);
          let gsum = 0;
          const step = 4 * 2;
          for (let i = 0; i < img.data.length; i += step) {
            gsum += img.data[i + 1]!;
          }
          const pixels = img.data.length / 4 / 2;
          const gmean = gsum / Math.max(1, pixels);
          const t = performance.now() / 1000;
          samplesRef.current.push({ t, g: gmean });
          if (samplesRef.current.length > 400) {
            samplesRef.current = samplesRef.current.slice(-400);
          }
        });

        const loop = async () => {
          if (cancelled) return;
          const v = videoRef.current;
          if (!optsRef.current.paused && v?.videoWidth) {
            const now = performance.now();
            if (now - lastProcessRef.current > 33) {
              lastProcessRef.current = now;
              try {
                await faceMesh.send({ image: v });
              } catch {
                /* ignore frame errors */
              }
            }
          }
          if (!optsRef.current.paused) {
            setState((s) => ({
              ...s,
              status: "Tracking — prototype vitals (not medical grade)",
            }));
          }
          rafRef.current = requestAnimationFrame(loop);
        };

        setState((s) => ({
          ...s,
          status: "Tracking face — stay still in good light",
        }));
        rafRef.current = requestAnimationFrame(loop);
      } catch (e) {
        if (!cancelled) {
          setState((s) => ({
            ...s,
            error:
              e instanceof Error ? e.message : "Face tracker failed to start.",
            status: "",
          }));
        }
      }
    })();

    return () => {
      cancelled = true;
      clearInterval(interval);
      cancelAnimationFrame(rafRef.current);
      void faceMeshRef.current?.close();
      faceMeshRef.current = null;
      samplesRef.current = [];
      bpmRawHistoryRef.current = [];
      lastGoodRrRef.current = 0;
      canvasRef.current = null;
    };
  }, [active, videoRef]);

  return state;
}
