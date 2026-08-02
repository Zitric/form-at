import { Muted } from "@form-at/ui";

interface PushPreviewProps {
  title: string;
  body: string;
  url?: string;
}

// Deliberately a plain, clearly-labeled text preview — NOT a skeuomorphic
// OS-notification mockup. Real notification rendering varies by OS/browser
// (Android, iOS, and desktop Chrome all differ in truncation, icon
// placement, action buttons), so faking pixel fidelity would be dishonest.
// This shows exactly what's being sent and nothing more — reused both as a
// live preview below the form and, frozen, inside the confirm modal.
export function PushPreview({ title, body, url }: PushPreviewProps) {
  return (
    <div className="border border-grey/30 p-4">
      <Muted className="mb-2 block text-xs uppercase tracking-widest">preview</Muted>
      <div className="t-label sm:t-label-md text-white">
        {title || <Muted as="span">(no title yet)</Muted>}
      </div>
      <div className="t-body sm:t-body-md text-grey mt-1">
        {body || <Muted as="span">(no body yet)</Muted>}
      </div>
      {url && <p className="text-xs text-grey/70 mt-2">opens: {url}</p>}
    </div>
  );
}
