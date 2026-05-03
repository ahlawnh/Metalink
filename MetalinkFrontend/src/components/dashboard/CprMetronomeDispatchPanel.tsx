import type { HapticCueTelemetry } from '@/types/dashboard'
import type { TelemetryConnectionState } from '@/hooks/useTelemetryStream'
import { cn } from '@/lib/utils'
import { useCallback, useState } from 'react'

type Props = {
  connectionState: TelemetryConnectionState
  hapticCue: HapticCueTelemetry
  sendDispatchCpr: (bpm: number) => void
  sendStopDispatchCpr: () => void
}

export default function CprMetronomeDispatchPanel({
  connectionState,
  hapticCue,
  sendDispatchCpr,
  sendStopDispatchCpr,
}: Props) {
  const [bpmInput, setBpmInput] = useState('110')
  const connected = connectionState === 'connected'

  const parseBpm = useCallback(() => {
    const n = Number.parseInt(bpmInput, 10)
    if (!Number.isFinite(n)) return 110
    return Math.min(140, Math.max(60, n))
  }, [bpmInput])

  const onSend = useCallback(() => {
    sendDispatchCpr(parseBpm())
  }, [parseBpm, sendDispatchCpr])

  const active = hapticCue.active && hapticCue.pattern === 'cpr_metronome'

  return (
    <section
      className={cn(
        'rounded-2xl border border-[color-mix(in_srgb,var(--dash-accent)_35%,transparent)]',
        'bg-[color-mix(in_srgb,var(--dash-accent)_8%,var(--dash-surface-raised))] p-4',
      )}
      aria-label="CPR guidance for bystander device"
    >
      <p className="dash-label text-[color-mix(in_srgb,var(--dash-accent)_90%,var(--dash-text-secondary))]">
        Bystander CPR metronome
      </p>
      <p className="mt-1 text-xs text-[var(--dash-text-secondary)]">
        Sends vibration cadence to the caller&apos;s incident feed (compression tempo, not medical advice).
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[11px] font-medium text-[var(--dash-text-secondary)]">
          Tempo (BPM)
          <input
            type="number"
            min={60}
            max={140}
            step={1}
            value={bpmInput}
            onChange={(e) => setBpmInput(e.target.value)}
            disabled={!connected}
            className={cn(
              'w-24 rounded-lg border border-[color-mix(in_srgb,var(--dash-text-secondary)_30%,transparent)]',
              'bg-[var(--dash-surface)] px-2 py-1.5 font-data text-sm text-[var(--dash-text-primary)]',
              'focus:border-[var(--dash-accent)] focus:outline-none',
              !connected && 'cursor-not-allowed opacity-50',
            )}
          />
        </label>
        <button
          type="button"
          onClick={onSend}
          disabled={!connected}
          className={cn(
            'rounded-lg px-4 py-2 text-sm font-semibold',
            'bg-[var(--dash-accent)] text-[var(--dash-surface)]',
            'hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40',
          )}
        >
          Send to caller
        </button>
        <button
          type="button"
          onClick={sendStopDispatchCpr}
          disabled={!connected || !active}
          className={cn(
            'rounded-lg border border-[color-mix(in_srgb,#FF5252_50%,transparent)] px-4 py-2 text-sm font-semibold',
            'text-[#FFAB91] hover:bg-[color-mix(in_srgb,#FF525212%,transparent)]',
            'disabled:cursor-not-allowed disabled:opacity-40',
          )}
        >
          Stop
        </button>
      </div>
      {active && typeof hapticCue.bpm === 'number' ? (
        <p className="mt-2 text-xs font-medium text-[#9BE89E]" role="status">
          Active on wire: {hapticCue.bpm} BPM
        </p>
      ) : null}
      {!connected ? (
        <p className="mt-2 text-xs text-[#FFAB91]">Connect telemetry WebSocket to send cues.</p>
      ) : null}
    </section>
  )
}
