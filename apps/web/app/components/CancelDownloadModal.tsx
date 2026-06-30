import { Button } from "~/components/Button";
import { Modal } from "~/components/Modal";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirmCancel: () => void;
  setTitle: string;
};

// Confirm-cancel for an in-flight `save_for_offline` download. Tapping the
// progress label opens this; the user can either commit to cancelling
// (drops the in-memory buffer + the IDB transaction never lands) or keep
// the download running. Deliberately small — the only meaningful action is
// the cancel, the rest is dismiss.
export function CancelDownloadModal({ open, onClose, onConfirmCancel, setTitle }: Props) {
  const handleCancel = () => {
    onConfirmCancel();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      ariaLabel="Cancel offline download"
      title={
        <div className="text-xs text-grey tracking-widest truncate">
          › <span className="text-white">cancel_download</span>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-grey leading-relaxed">
          cancel saving <span className="text-white">{setTitle}</span> for offline listening? the
          partial download will be discarded.
        </p>
        <div className="flex flex-col gap-2">
          <Button variant="secondary" onClick={handleCancel} className="text-left">
            cancel_download
          </Button>
          <Button variant="secondary" onClick={onClose} className="text-left">
            keep_downloading
          </Button>
        </div>
      </div>
    </Modal>
  );
}
