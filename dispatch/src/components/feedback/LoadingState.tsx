interface LoadingStateProps {
  label?: string
}

export function LoadingState({ label = 'Loading telemetry feed...' }: LoadingStateProps) {
  return (
    <section
      className="m-6 rounded-lg border border-zinc-700 bg-zinc-900/90 p-4 text-zinc-100"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <span className="inline-block size-3 animate-pulse rounded-full bg-cyan-400" />
        <p className="text-sm">{label}</p>
      </div>
    </section>
  )
}
