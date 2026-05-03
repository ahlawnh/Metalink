"use client";

import { useEffect, useRef } from "react";

/**
 * Local camera/mic preview using getUserMedia — works without LiveKit while backend is in progress.
 */
export default function LocalCameraPreview({ stream, className = "" }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !stream) return;
    el.srcObject = stream;
    return () => {
      el.srcObject = null;
    };
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className={`h-full w-full object-cover ${className}`}
      aria-label="Your camera preview"
    />
  );
}
