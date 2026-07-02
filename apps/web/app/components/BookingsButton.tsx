import { useState } from "react";
import { BracketLabel } from "~/components/BracketLabel";
import { Button } from "~/components/Button";
import { Modal } from "~/components/Modal";
import { TerminalRow } from "~/components/TerminalRow";
import { useStore } from "~/store";
import { buildAndroidIntent, isAndroid } from "~/utils/deeplink";

const BOOKINGS_EMAIL = "format.gla@gmail.com";
const BOOKINGS_SUBJECT = "Form:at booking inquiry";

// Wrap a webmail compose URL in an Android `intent://` URL so the matching
// app (Gmail / Outlook) opens directly instead of the web compose view.
// `browser_fallback_url` keeps the experience graceful when the app isn't
// installed. Non-Android user agents get the unchanged web URL.
function maybeWrapForAndroid(webUrl: string, pkg: string): string {
  return isAndroid() ? buildAndroidIntent(webUrl, pkg) : webUrl;
}

// Dropdown anchor row — same visual vocabulary as <Button variant="secondary">
// but on an <a> because these are navigations, not actions. Bracket rendering
// comes from <BracketLabel> inside; layout/typography stays here.
const anchorRowClass =
  "text-left text-sm text-grey hover:text-white transition-colors tracking-widest cursor-pointer py-1 whitespace-nowrap";

/** `mailto:` alone is brittle — many users don't have a default mail client
 *  configured, or the configured one isn't what they actually use (e.g.
 *  browses on Chrome but replies from Gmail web). This modal hands the user
 *  the choice: copy the address, or compose in the webmail / app of their
 *  choice. */
export function BookingsButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const setToast = useStore((s) => s.setToast);

  const gmailWeb =
    `https://mail.google.com/mail/?view=cm&fs=1&to=${BOOKINGS_EMAIL}` +
    `&su=${encodeURIComponent(BOOKINGS_SUBJECT)}`;
  const outlookWeb =
    `https://outlook.live.com/mail/0/deeplink/compose?to=${BOOKINGS_EMAIL}` +
    `&subject=${encodeURIComponent(BOOKINGS_SUBJECT)}`;
  const gmailUrl = maybeWrapForAndroid(gmailWeb, "com.google.android.gm");
  const outlookUrl = maybeWrapForAndroid(outlookWeb, "com.microsoft.office.outlook");
  const mailtoUrl = `mailto:${BOOKINGS_EMAIL}?subject=${encodeURIComponent(BOOKINGS_SUBJECT)}`;
  const isGmailIntent = gmailUrl.startsWith("intent:");
  const isOutlookIntent = outlookUrl.startsWith("intent:");

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(BOOKINGS_EMAIL);
      setToast("email_copied");
    } catch {
      setToast("copy_unavailable");
    }
    setOpen(false);
  };

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} className={className}>
        bookings
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        ariaLabel="Bookings"
        title={
          <div className="text-xs text-grey tracking-widest truncate">
            › <span className="text-white">bookings</span>
          </div>
        }
      >
        {/* Subject row — always renders the full address so it never truncates
            inside the title bar, matches the modal's terminal aesthetic, and
            doubles as a "you're about to email this" confirmation. */}
        <TerminalRow label="target" value={BOOKINGS_EMAIL} className="mb-6" />
        <div className="flex flex-col">
          <Button variant="secondary" onClick={copyEmail} className="text-left py-1">
            copy_email
          </Button>
          <a
            href={gmailUrl}
            target={isGmailIntent ? undefined : "_blank"}
            rel={isGmailIntent ? undefined : "noopener noreferrer"}
            onClick={() => setOpen(false)}
            className={anchorRowClass}
          >
            <BracketLabel>gmail</BracketLabel>
          </a>
          <a
            href={outlookUrl}
            target={isOutlookIntent ? undefined : "_blank"}
            rel={isOutlookIntent ? undefined : "noopener noreferrer"}
            onClick={() => setOpen(false)}
            className={anchorRowClass}
          >
            <BracketLabel>outlook</BracketLabel>
          </a>
          <a href={mailtoUrl} onClick={() => setOpen(false)} className={anchorRowClass}>
            <BracketLabel>mail_app</BracketLabel>
          </a>
        </div>
      </Modal>
    </>
  );
}
