import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import type { HazardTelemetry } from '@/types/dashboard'

type UnitType = 'EMS' | 'Police' | 'Fire'
type UnitStatus = 'en_route' | 'on_scene' | 'staged'

interface DispatchedUnit {
  type: UnitType
  callSign: string
  dispatchedAt: Date
  status: UnitStatus
}

type EventKind = 'dispatch' | 'hazard' | 'cpr' | 'system'

interface EventLogEntry {
  id: string
  ts: Date
  text: string
  kind: EventKind
}

interface DispatchPanelProps {
  hazards: HazardTelemetry[]
  cprActive: boolean
}

const UNIT_CALL_SIGNS: Record<UnitType, string> = {
  EMS: 'Medic 7',
  Police: 'Unit 42',
  Fire: 'Engine 3',
}

const UNIT_THEME: Record<UnitType, { ring: string; chip: string; label: string }> = {
  EMS: {
    ring: 'border-red-400/35 bg-[color-mix(in_srgb,#FF5252_8%,rgba(0,0,0,0.4))]',
    chip: 'border-red-400/45 bg-red-950/45 text-red-200',
    label: 'EMS',
  },
  Police: {
    ring: 'border-cyan-400/30 bg-[color-mix(in_srgb,#00E5FF_8%,rgba(0,0,0,0.4))]',
    chip: 'border-cyan-400/45 bg-cyan-950/45 text-cyan-200',
    label: 'Police',
  },
  Fire: {
    ring: 'border-amber-400/30 bg-[color-mix(in_srgb,#FFB74D_8%,rgba(0,0,0,0.4))]',
    chip: 'border-amber-400/45 bg-amber-950/45 text-amber-200',
    label: 'Fire',
  },
}

const KIND_ACCENT: Record<EventKind, string> = {
  dispatch: 'border-l-cyan-400/70',
  hazard: 'border-l-red-400/70',
  cpr: 'border-l-amber-400/70',
  system: 'border-l-white/30',
}

function formatTs(ts: Date): string {
  return ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export default function DispatchPanel({ hazards, cprActive }: DispatchPanelProps) {
  const [units, setUnits] = useState<DispatchedUnit[]>([])
  const [log, setLog] = useState<EventLogEntry[]>(() => [
    { id: newId(), ts: new Date(), kind: 'system', text: 'Session started · awaiting dispatcher action' },
  ])
  const [eventLogOpen, setEventLogOpen] = useState(false)

  const append = useCallback((kind: EventKind, text: string) => {
    setLog((prev) => [...prev, { id: newId(), ts: new Date(), kind, text }].slice(-100))
  }, [])

  const onDispatch = useCallback(
    (type: UnitType) => {
      if (units.some((u) => u.type === type)) return
      const callSign = UNIT_CALL_SIGNS[type]
      const newUnit: DispatchedUnit = { type, callSign, dispatchedAt: new Date(), status: 'en_route' }
      setUnits((prev) => [...prev, newUnit])
      append('dispatch', `Dispatched ${type} · ${callSign} en route`)
    },
    [units, append],
  )

  const onMarkOnScene = useCallback(
    (callSign: string) => {
      setUnits((prev) =>
        prev.map((u) => (u.callSign === callSign ? { ...u, status: 'on_scene' as const } : u)),
      )
      append('dispatch', `${callSign} on scene`)
    },
    [append],
  )

  const onClearUnit = useCallback(
    (callSign: string) => {
      setUnits((prev) => prev.filter((u) => u.callSign !== callSign))
      append('dispatch', `${callSign} cleared`)
    },
    [append],
  )

  const lastHazardCountRef = useRef(hazards.length)
  useEffect(() => {
    if (hazards.length > lastHazardCountRef.current) {
      const newest = hazards[hazards.length - 1]
      if (newest) {
        append('hazard', `Hazard detected · ${newest.type}`)
      }
    }
    lastHazardCountRef.current = hazards.length
  }, [hazards, append])

  const lastCprRef = useRef<boolean | null>(null)
  useEffect(() => {
    if (lastCprRef.current === null) {
      lastCprRef.current = cprActive
      return
    }
    if (lastCprRef.current !== cprActive) {
      append('cpr', cprActive ? 'CPR guidance started' : 'CPR guidance stopped')
      lastCprRef.current = cprActive
    }
  }, [cprActive, append])

  const logScrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = logScrollRef.current
    if (el && eventLogOpen) {
      el.scrollTop = el.scrollHeight
    }
  }, [eventLogOpen, log.length])

  const latestLog = log.at(-1)

  return (
    <section className="dash-card flex flex-col gap-3 p-3" aria-label="Dispatch and event log">
      <div className="flex items-center justify-between">
        <p className="dash-label tracking-[0.14em]">Dispatch</p>
        <span className="font-data text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--dash-text-secondary)]">
          {units.length} unit{units.length === 1 ? '' : 's'} active
        </span>
      </div>

      {/* Dispatch buttons */}
      <div className="grid grid-cols-3 gap-1.5">
        {(Object.keys(UNIT_CALL_SIGNS) as UnitType[]).map((type) => {
          const dispatched = units.some((u) => u.type === type)
          const theme = UNIT_THEME[type]
          return (
            <button
              key={type}
              type="button"
              disabled={dispatched}
              onClick={() => onDispatch(type)}
              className={cn(
                'rounded-md border px-2 py-1.5 font-data text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors',
                dispatched
                  ? 'cursor-not-allowed border-white/[0.05] bg-white/[0.02] text-[var(--dash-text-secondary)] opacity-60'
                  : cn(theme.ring, 'text-[var(--dash-text-primary)] hover:brightness-125'),
              )}
              title={dispatched ? `${theme.label} already dispatched` : `Dispatch ${theme.label}`}
            >
              {dispatched ? `${theme.label} ✓` : `+ ${theme.label}`}
            </button>
          )
        })}
      </div>

      {/* Active units roster */}
      {units.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {units.map((u) => {
            const theme = UNIT_THEME[u.type]
            return (
              <li
                key={u.callSign}
                className={cn('flex items-center justify-between rounded-md border px-2 py-1.5', theme.ring)}
              >
                <div className="flex min-w-0 flex-col">
                  <span className="font-data text-[11px] font-semibold tabular-nums text-[var(--dash-text-primary)]">
                    {u.callSign}
                  </span>
                  <span className="font-data text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--dash-text-secondary)]">
                    {u.type} · {formatTs(u.dispatchedAt)}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <span
                    className={cn(
                      'rounded-full border px-1.5 py-0.5 font-data text-[8px] font-semibold uppercase tracking-[0.1em]',
                      u.status === 'on_scene'
                        ? 'border-emerald-400/45 bg-emerald-950/45 text-emerald-200'
                        : theme.chip,
                    )}
                  >
                    {u.status === 'on_scene' ? 'On scene' : 'En route'}
                  </span>
                  {u.status === 'en_route' ? (
                    <button
                      type="button"
                      onClick={() => onMarkOnScene(u.callSign)}
                      className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-data text-[8px] font-semibold uppercase tracking-[0.1em] text-[var(--dash-text-primary)] hover:bg-white/[0.08] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                      title="Mark unit on scene"
                    >
                      Arrived
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onClearUnit(u.callSign)}
                      className="rounded border border-white/[0.08] bg-white/[0.04] px-1.5 py-0.5 font-data text-[8px] font-semibold uppercase tracking-[0.1em] text-[var(--dash-text-secondary)] hover:bg-white/[0.08] hover:text-[var(--dash-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
                      title="Clear unit"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      ) : null}

      {/* Event log */}
      <div className="mt-1 border-t border-white/[0.06] pt-2">
        <button
          type="button"
          onClick={() => setEventLogOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-1 text-left transition-colors hover:bg-white/[0.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/50"
          aria-expanded={eventLogOpen}
          aria-controls="dispatch-event-log"
        >
          <span className="min-w-0">
            <span className="dash-label block tracking-[0.14em]">Event log</span>
            {latestLog ? (
              <span className="mt-0.5 block truncate text-[11px] text-[var(--dash-text-secondary)]">
                Latest · {latestLog.text}
              </span>
            ) : null}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="font-data text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--dash-text-secondary)]">
              {log.length}
            </span>
            <span className="font-data text-[10px] text-[var(--dash-text-secondary)]" aria-hidden>
              {eventLogOpen ? '▲' : '▼'}
            </span>
          </span>
        </button>
        {eventLogOpen ? (
          <div
            id="dispatch-event-log"
            ref={logScrollRef}
            className="mt-1.5 max-h-40 overflow-y-auto overscroll-y-contain rounded-md border border-white/[0.05] bg-black/30 px-1.5 py-1.5"
          >
            <ul className="flex flex-col gap-1">
              {log.map((entry) => (
                <li
                  key={entry.id}
                  className={cn('border-l-2 pl-2 leading-snug', KIND_ACCENT[entry.kind])}
                >
                  <span className="font-data text-[10px] font-semibold tabular-nums text-[var(--dash-text-secondary)]">
                    {formatTs(entry.ts)}
                  </span>{' '}
                  <span className="text-[11px] text-[var(--dash-text-primary)]">{entry.text}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  )
}
