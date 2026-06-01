import { Modal } from "~/components/Modal";
import { useStore } from "~/store";
import { getAudioCurrentTime } from "~/store/playerSlice";
import { fmtTimestamp } from "~/utils/fmt";

const rowClass =
  "text-left text-sm text-grey hover:text-white transition-colors tracking-widest cursor-pointer py-1";
const sectionLabelClass = "text-xs text-grey/60 tracking-widest mb-2";

export function ShareModal() {
  const shareSet = useStore((s) => s.shareSet);
  const closeShareModal = useStore((s) => s.closeShareModal);
  const setToast = useStore((s) => s.setToast);
  const nowPlaying = useStore((s) => s.nowPlaying);

  if (!shareSet) return null;

  const isCurrent = nowPlaying?.id === shareSet.id;
  const currentTime = isCurrent ? Math.floor(getAudioCurrentTime()) : 0;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const baseUrl = `${origin}/sets/${shareSet.id}`;
  const text = `Listen to ${shareSet.artist} at ${shareSet.title}, Glasgow.`;
  const urlAt = (t?: number) => (t && t > 0 ? `${baseUrl}?t=${t}` : baseUrl);
  const url = urlAt();
  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(text);
  // Native share is the only realistic way to reach Instagram (Story / DM) and
  // other apps installed on the device, since they don't expose web share URLs.
  const hasNativeShare = typeof navigator !== "undefined" && "share" in navigator;

  const copy = async (t?: number) => {
    try {
      await navigator.clipboard.writeText(urlAt(t));
      setToast("link_copied");
    } catch {
      setToast("share_unavailable");
    }
    closeShareModal();
  };

  const openExternal = (href: string) => {
    window.open(href, "_blank", "noopener,noreferrer");
    closeShareModal();
  };

  const shareViaApps = async () => {
    try {
      await navigator.share({
        title: `${shareSet.artist} — ${shareSet.title}`,
        text,
        url,
      });
    } catch {
      // user cancelled or share failed — fall through silently
    }
    closeShareModal();
  };

  return (
    <Modal
      open
      onClose={closeShareModal}
      ariaLabel="Share set"
      title={
        <div className="text-xs text-grey tracking-widest truncate">
          › share <span className="text-white">{shareSet.artist}</span> signal
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-x-6">
        <div>
          <div className={sectionLabelClass}>link:</div>
          <div className="flex flex-col">
            <button type="button" onClick={() => copy()} className={rowClass}>
              [ copy_link ]
            </button>
            {isCurrent && currentTime > 3 && (
              <button type="button" onClick={() => copy(currentTime)} className={rowClass}>
                [ copy @ {fmtTimestamp(currentTime)} ]
              </button>
            )}
          </div>
        </div>
        <div>
          <div className={sectionLabelClass}>send:</div>
          <div className="flex flex-col">
            {hasNativeShare && (
              <button type="button" onClick={shareViaApps} className={rowClass}>
                [ share_via_apps ]
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                openExternal(`https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`)
              }
              className={rowClass}
            >
              [ whatsapp ]
            </button>
            <button
              type="button"
              onClick={() =>
                openExternal(`https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`)
              }
              className={rowClass}
            >
              [ telegram ]
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
