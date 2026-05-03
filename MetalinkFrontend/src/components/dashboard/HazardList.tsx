import { cn } from '@/lib/utils'
import type { HazardTelemetry } from '@/types/dashboard'

interface HazardListProps {
  hazards: HazardTelemetry[]
}

export default function HazardList({ hazards }: HazardListProps) {
  const criticalHazards = hazards.filter((hazard) => hazard.severity === 'critical')
  const watchHazards = hazards.filter((hazard) => hazard.severity !== 'critical')

  return (
    <section aria-label="Priority hazard alerts">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <p className="dash-label tracking-[0.14em]">Priority alerts</p>
        <span className="font-data text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--dash-text-secondary)]">
          {hazards.length} detected
        </span>
      </div>

      <ul className="space-y-2">
        {criticalHazards.map((hazard) => (
          <li
            key={hazard.id}
            className={cn(
              'relative overflow-hidden rounded-xl border border-red-400/45 bg-[color-mix(in_srgb,#FF1744_14%,rgba(0,0,0,0.55))] px-4 py-3',
              'shadow-[inset_0_1px_0_rgba(255,100,100,0.18),0_0_0_1px_rgba(255,255,255,0.04),0_18px_52px_rgba(255,23,68,0.22)]',
              'backdrop-blur-sm motion-safe:animate-pulse motion-reduce:animate-none',
              'before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-red-300/70 before:to-transparent',
            )}
          >
            <p className="text-base font-extrabold uppercase tracking-[0.1em] text-red-100 drop-shadow-[0_0_8px_rgba(255,100,100,0.32)]">
              {hazard.type}
            </p>
            <p className="mt-1 font-data text-[11px] font-semibold uppercase tracking-[0.14em] text-red-100/70">
              Critical · {Math.round(hazard.confidence * 100)}% confidence
            </p>
          </li>
        ))}

        {watchHazards.map((hazard) => (
          <li
            key={hazard.id}
            className={cn(
              'relative overflow-hidden rounded-lg border border-amber-400/25 bg-[color-mix(in_srgb,#FFB74D_8%,rgba(0,0,0,0.45))] px-3 py-2.5',
              'shadow-[inset_0_1px_0_rgba(255,183,77,0.12),0_0_0_1px_rgba(255,255,255,0.03)]',
              'backdrop-blur-sm',
              'before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-amber-300/50 before:to-transparent',
            )}
          >
            <p className="text-sm font-bold uppercase tracking-[0.08em] text-amber-100/90">{hazard.type}</p>
            <p className="mt-0.5 font-data text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-100/55">
              {hazard.severity} · {Math.round(hazard.confidence * 100)}% confidence
            </p>
          </li>
        ))}

        {hazards.length === 0 ? (
          <li className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-sm text-[var(--dash-text-secondary)] backdrop-blur-sm">
            No priority hazards detected
          </li>
        ) : null}
      </ul>
    </section>
  )
}
