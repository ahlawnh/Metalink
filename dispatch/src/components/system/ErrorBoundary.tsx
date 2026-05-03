import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = { hasError: false }

  public static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Dashboard render error:', error, errorInfo)
  }

  public render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <section className="m-6 rounded-lg border border-red-500/60 bg-red-950/50 p-4 text-red-100">
            <h2 className="text-lg font-semibold">Telemetry view unavailable</h2>
            <p className="mt-2 text-sm text-red-200">
              The dashboard hit an unexpected error. Reload to restore the command view.
            </p>
          </section>
        )
      )
    }

    return this.props.children
  }
}
