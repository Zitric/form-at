import { Modal } from "~/components/Modal";
import { fmtBytes } from "~/utils/fmt";

const linkClass =
  "text-sm text-grey hover:text-white transition-colors tracking-widest cursor-pointer text-left";

type Props = {
  open: boolean;
  onClose: () => void;
  onRetry: () => void;
  shortfallBytes: number;
};

// Surfaces a `failed/quota` state explanation when the user taps the
// `[ ✗ need NNMB more ]` button. Honest — names the shortfall in concrete
// bytes (not "your storage is full" hand-wave) so they know exactly what
// to free up. The retry action restarts the download flow; if they free
// enough space it'll succeed, otherwise it'll bounce back to this modal
// with an updated shortfall.
export function QuotaInfoModal({ open, onClose, onRetry, shortfallBytes }: Props) {
  const handleRetry = () => {
    onRetry();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      ariaLabel="Not enough storage to save offline"
      title={
        <div className="text-xs text-grey tracking-widest truncate">
          › <span className="text-white">storage_low</span>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-grey leading-relaxed">
          not enough storage. need{" "}
          <span className="text-white">~{fmtBytes(shortfallBytes)} more</span> free on this device
          to save this set offline.
        </p>
        <p className="text-xs text-grey leading-relaxed">
          we leave a 50% headroom on top of the file size so the download has room to land cleanly.
          free up space and try again, or save a smaller set instead.
        </p>
        <div className="flex flex-col gap-2">
          <button type="button" onClick={handleRetry} className={linkClass}>
            [ try_again ]
          </button>
          <button type="button" onClick={onClose} className={linkClass}>
            [ close ]
          </button>
        </div>
      </div>
    </Modal>
  );
}
