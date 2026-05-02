import { LoadingState } from '@/components/feedback/LoadingState'
import { ErrorBoundary } from '@/components/system/ErrorBoundary'
import { TelemetryProvider, useTelemetryContext } from '@/context/TelemetryContext'
import { MainLayout } from '@/layouts/MainLayout'

function AppShell() {
  const telemetry = useTelemetryContext()

  if (!telemetry.updatedAt) {
    return <LoadingState label="Waiting for telemetry snapshot..." />
  }

  return <MainLayout />
}

export default function App() {
  return (
    <ErrorBoundary>
      <TelemetryProvider>
        <AppShell />
      </TelemetryProvider>
    </ErrorBoundary>
  )
}
