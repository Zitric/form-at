import { BracketLabel } from "~/components/BracketLabel";
import { Modal } from "~/components/Modal";
import { TerminalRow } from "~/components/TerminalRow";
import { useStore } from "~/store";
import { getAudioCurrentTime } from "~/store/playerSlice";
import { buildAndroidIntent, isAndroid } from "~/utils/deeplink";
import { fmtTimestamp } from "~/utils/fmt";

// Each platform's `wa.me` / `t.me` URL is already a Universal Link / App Link
// in theory — but Android only honours them if the user has enabled "open
// supported links" in the app's settings. An `intent://` URL forces the OS
// hand-off to the installed app and uses the web URL as graceful fallback.
function whatsappHref(text: string, url: string): string {
  const web = `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
  return isAndroid() ? buildAndroidIntent(web, "com.whatsapp") : web;
}

function telegramHref(url: string, text: string): string {
  const web = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  return isAndroid() ? buildAndroidIntent(web, "org.telegram.messenger") : web;
}

const rowClass =
  "text-left text-sm text-grey hover:text-white transition-colors tracking-widest cursor-pointer py-1 whitespace-nowrap";
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
  // Native share is the only realistic way to reach Instagram (Story / DM) and
  // other apps installed on the device, since they don't expose web share URLs.
  const hasNativeShare = typeof navigator !== "undefined" && "share" in navigator;
  const waHref = whatsappHref(text, url);
  const tgHref = telegramHref(url, text);
  const isWaIntent = waHref.startsWith("intent:");
  const isTgIntent = tgHref.startsWith("intent:");

  const copy = async (t?: number) => {
    try {
      await navigator.clipboard.writeText(urlAt(t));
      setToast("link_copied");
    } catch {
      setToast("share_unavailable");
    }
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
          › <span className="text-white">share_signal</span>
        </div>
      }
    >
      {/* Subject row — names what's about to be shared, in the same
          terminal-row style as the rest of the app. Long artist names
          wrap inside the body instead of truncating in the title. */}
      <TerminalRow label="set" value={`${shareSet.artist} @ ${shareSet.title}`} className="mb-6" />
      {/* Flexbox + flex-shrink-0 lets each column auto-size to its widest
          button (e.g. `[ copy @ 49:00 ]`) instead of being forced into an
          equal half. When the two columns together can't fit the modal
          width, flex-wrap stacks them vertically — no manual breakpoint. */}
      <div className="flex flex-wrap gap-x-6 gap-y-4">
        <div className="flex-shrink-0">
          <div className={sectionLabelClass}>link:</div>
          <div className="flex flex-col">
            <button type="button" onClick={() => copy()} className={rowClass}>
              <BracketLabel>copy_link</BracketLabel>
            </button>
            {isCurrent && currentTime > 3 && (
              <button type="button" onClick={() => copy(currentTime)} className={rowClass}>
                <BracketLabel>copy @ {fmtTimestamp(currentTime)}</BracketLabel>
              </button>
            )}
          </div>
        </div>
        <div className="flex-shrink-0">
          <div className={sectionLabelClass}>send:</div>
          <div className="flex flex-col">
            {hasNativeShare && (
              <button type="button" onClick={shareViaApps} className={rowClass}>
                <BracketLabel>apps</BracketLabel>
              </button>
            )}
            <a
              href={waHref}
              target={isWaIntent ? undefined : "_blank"}
              rel={isWaIntent ? undefined : "noopener noreferrer"}
              onClick={closeShareModal}
              className={rowClass}
            >
              <BracketLabel>whatsapp</BracketLabel>
            </a>
            <a
              href={tgHref}
              target={isTgIntent ? undefined : "_blank"}
              rel={isTgIntent ? undefined : "noopener noreferrer"}
              onClick={closeShareModal}
              className={rowClass}
            >
              <BracketLabel>telegram</BracketLabel>
            </a>
          </div>
        </div>
      </div>
    </Modal>
  );
}
