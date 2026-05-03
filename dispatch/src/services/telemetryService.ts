import telemetryData from '@/data/telemetry.json'
import type { DashboardTelemetryPayload } from '@/types/dashboard'

export async function fetchTelemetrySnapshot(): Promise<DashboardTelemetryPayload> {
  return telemetryData as DashboardTelemetryPayload
}
