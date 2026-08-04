import { PageTitle } from "@form-at/ui";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { UploadSetForm } from "~/components/UploadSetForm";

// Set-upload feature (PR4). Same "Access gates the page load" pattern as
// dashboard.tsx/notifications.tsx — this component has no auth logic of its
// own; the mutating work happens in routes/api/sets-presign.ts and
// routes/api/sets.ts, which verify the Access identity themselves.
export const Route = createFileRoute("/sets")({
  head: () => ({ meta: [{ title: "Sets · Form:at Admin" }] }),
  component: SetsPage,
});

function SetsPage() {
  const router = useRouter();

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <PageTitle>sets</PageTitle>
      <UploadSetForm
        onCreated={() => {
          // No loader data on this route today, but invalidating keeps the
          // pattern consistent with notifications.tsx's onSent — cheap, and
          // correct if this route ever grows a loader (e.g. a recent-
          // uploads list).
          router.invalidate();
        }}
      />
    </div>
  );
}
