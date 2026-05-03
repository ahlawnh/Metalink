/**
 * Contract for incident session telemetry (location + rPPG vitals).
 * Keep in sync with `backend/app/api/incident_telemetry.py`.
 */

export const INCIDENT_TELEMETRY_SCHEMA_VERSION = 1 as const;

export type IncidentLocationSnapshot = {
  latitude: number;
  longitude: number;
  /** Meters; `null` if unknown */
  accuracyM: number | null;
  altitudeM: number | null;
  headingDeg: number | null;
  speedMps: number | null;
  source: "browser";
  recordedAt: string;
};

export type IncidentVitalsSnapshot = {
  heartRateBpm: number | null;
  respiratoryRate: number | null;
  bpmAnalyzing: boolean;
};

export type IncidentTelemetryBatch = {
  schemaVersion: typeof INCIDENT_TELEMETRY_SCHEMA_VERSION;
  sessionId: string;
  roomName: string;
  livekitIdentity: string;
  callStartedAt: string;
  sentAt: string;
  location: IncidentLocationSnapshot | null;
  vitals: IncidentVitalsSnapshot;
};

export function positionToSnapshot(
  pos: GeolocationPosition
): IncidentLocationSnapshot {
  const c = pos.coords;
  return {
    latitude: c.latitude,
    longitude: c.longitude,
    accuracyM: Number.isFinite(c.accuracy) ? c.accuracy : null,
    altitudeM:
      c.altitude != null && Number.isFinite(c.altitude) ? c.altitude : null,
    headingDeg:
      c.heading != null && Number.isFinite(c.heading) ? c.heading : null,
    speedMps: c.speed != null && Number.isFinite(c.speed) ? c.speed : null,
    source: "browser",
    recordedAt: new Date(pos.timestamp).toISOString(),
  };
}

/**
 * Prompts the browser for location (call from a user gesture, e.g. button click).
 * Returns `null` if denied, unavailable, or timeout.
 */
export function requestInitialGeolocation(
  options?: PositionOptions
): Promise<IncidentLocationSnapshot | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(positionToSnapshot(pos)),
      () => resolve(null),
      {
        enableHighAccuracy: true,
        timeout: 20_000,
        maximumAge: 0,
        ...options,
      }
    );
  });
}
