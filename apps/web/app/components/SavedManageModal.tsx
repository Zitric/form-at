import { Modal } from "~/components/Modal";
import { fmtBytes } from "~/utils/fmt";

const linkClass =
  "text-sm text-grey hover:text-white transition-colors tracking-widest cursor-pointer text-left";

type Props = {
  open: boolean;
  onClose: () => void;
  onRemove: () => void;
  setTitle: string;
  bytesTotal: number;
};

// Per-set manage modal opened from `[ saved · NNMB ]` taps. Minimal: confirms
// the set is saved, shows the real on-device size, offers `remove from
// library` as the inverse action. The "see all my saved sets" library view
// is Phase 4 polish; this modal is just the per-set affordance.
export function SavedManageModal({ open, onClose, onRemove, setTitle, bytesTotal }: Props) {
  const handleRemove = () => {
    onRemove();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      ariaLabel="Manage saved offline set"
      title={
        <div className="text-xs text-grey tracking-widest truncate">
          › <span className="text-white">offline_library</span>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-grey leading-relaxed">
          <span className="text-white">{setTitle}</span> is saved to your offline library —{" "}
          <span className="text-white">{fmtBytes(bytesTotal)}</span> on this device. plays without a
          network connection.
        </p>
        <div className="flex flex-col gap-2">
          <button type="button" onClick={handleRemove} className={linkClass}>
            [ remove_from_library ]
          </button>
          <button type="button" onClick={onClose} className={linkClass}>
            [ keep ]
          </button>
        </div>
      </div>
    </Modal>
  );
}
