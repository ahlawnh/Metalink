import telemetryData from '@/data/telemetry.json'
import type { DashboardTelemetryPayload } from '@/types/dashboard'

export function useTelemetryMock(): DashboardTelemetryPayload {
  return telemetryData as DashboardTelemetryPayload
}
