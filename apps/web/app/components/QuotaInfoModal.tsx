import { Button } from "~/components/Button";
import { Modal } from "~/components/Modal";
import { fmtBytes } from "~/utils/fmt";

type Props = {
  open: boolean;
  onClose: () => void;
  onRetry: () => void;
  // Known only when the quota PRE-FLIGHT caught the shortage. A quota hit
  // during the IDB write itself (or on browsers with no `estimate`) has no
  // measurable shortfall — undefined here, and the copy degrades to a
  // number-free "not enough storage" instead of lying with "~0 B more".
  shortfallBytes: number | undefined;
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
          not enough storage.{" "}
          {shortfallBytes !== undefined ? (
            <>
              need <span className="text-white">~{fmtBytes(shortfallBytes)} more</span> free on this
              device to save this set offline.
            </>
          ) : (
            <>this device ran out of space while saving — free some up to fit this set.</>
          )}
        </p>
        <p className="text-xs text-grey leading-relaxed">
          we leave a 50% headroom on top of the file size so the download has room to land cleanly.
          free up space and try again, or save a smaller set instead.
        </p>
        <div className="flex flex-col gap-2">
          <Button variant="secondary" onClick={handleRetry} className="text-left">
            try_again
          </Button>
          <Button variant="secondary" onClick={onClose} className="text-left">
            close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
