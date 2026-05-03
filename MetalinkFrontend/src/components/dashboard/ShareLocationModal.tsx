import { Modal } from '@/components/ui/Modal'

interface ShareLocationModalProps {
  open: boolean
  onClose: () => void
  /** Human-readable label shown for confirmation context */
  locationLabel: string
  latitudeLabel: string
  longitudeLabel: string
  onConfirmShare: () => void
}

export default function ShareLocationModal({
  open,
  onClose,
  locationLabel,
  latitudeLabel,
  longitudeLabel,
  onConfirmShare,
}: ShareLocationModalProps) {
  return (
    <Modal
      open={open}
      title="Share location"
      description="Confirm to push this fused GPS fix to dispatch consoles and the caller link channel (stub until CAD/SMS hooks land)."
      onClose={onClose}
      secondaryAction={{ label: 'Cancel', onClick: onClose }}
      primaryAction={{
        label: 'Confirm share',
        onClick: () => {
          onConfirmShare()
          onClose()
        },
      }}
    >
      <div className="rounded-lg bg-[var(--dash-bg)] p-3 ring-1 ring-white/[0.06]">
        <p className="dash-label">Selected fix</p>
        <p className="mt-2 text-sm font-semibold text-[var(--dash-text-primary)]">{locationLabel}</p>
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="dash-label">Latitude</dt>
            <dd className="font-data mt-1 tabular-nums text-[var(--dash-text-primary)]">{latitudeLabel}</dd>
          </div>
          <div>
            <dt className="dash-label">Longitude</dt>
            <dd className="font-data mt-1 tabular-nums text-[var(--dash-text-primary)]">{longitudeLabel}</dd>
          </div>
        </dl>
      </div>
      <p className="mt-3 text-xs text-[var(--dash-text-secondary)]">
        Cancel keeps coordinates internal to this workstation until you confirm.
      </p>
    </Modal>
  )
}
