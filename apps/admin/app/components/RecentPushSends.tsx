import { Label, Muted, TerminalRow } from "@form-at/ui";
import type { RecentPushSend } from "~/data/push-sends";

interface RecentPushSendsProps {
  sends: RecentPushSend[];
}

// Locale and timeZone pinned, not left to resolve from the environment — see
// SetsList.tsx's fmtWhen for why an unpinned format here is a React
// hydration-mismatch bug (server and browser can default to different
// locales/timezones for the same SSR'd timestamp), not just a display quirk.
function fmtSentAt(ms: number): string {
  return new Date(ms).toLocaleString("en-GB", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
}

// Shown above the send form so an accidental duplicate send is visible
// BEFORE it happens, not after — three people have Cloudflare Access, and
// nothing stops two of them sending the same announcement minutes apart,
// or a page refresh resubmitting.
export function RecentPushSends({ sends }: RecentPushSendsProps) {
  return (
    <div className="border border-grey/30 p-4">
      <Label className="mb-2 text-grey tracking-widest">{"// recent_sends"}</Label>
      {sends.length === 0 ? (
        <Muted>no sends yet</Muted>
      ) : (
        <div className="space-y-1">
          {sends.map((send, i) => (
            <TerminalRow
              key={`${send.sentAt}-${i}`}
              label={`${fmtSentAt(send.sentAt)} · ${send.sentByEmail} · ${send.title}`}
              value={`${send.sentCount} sent / ${send.failedCount} failed / ${send.deadRemovedCount} removed`}
              dimValue
            />
          ))}
        </div>
      )}
    </div>
  );
}
