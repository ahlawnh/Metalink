import { createContext, useContext, type ReactNode } from 'react'
import { useTelemetryMock } from '@/hooks/useTelemetryMock'
import type { DashboardTelemetryPayload } from '@/types/dashboard'

const TelemetryContext = createContext<DashboardTelemetryPayload | null>(null)

interface TelemetryProviderProps {
  children: ReactNode
}

export function TelemetryProvider({ children }: TelemetryProviderProps) {
  const telemetry = useTelemetryMock()
  return <TelemetryContext.Provider value={telemetry}>{children}</TelemetryContext.Provider>
}

export function useTelemetryContext() {
  const value = useContext(TelemetryContext)
  if (!value) {
    throw new Error('useTelemetryContext must be used inside TelemetryProvider')
  }
  return value
}
