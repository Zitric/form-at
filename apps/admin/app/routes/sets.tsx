import { PageTitle } from "@form-at/ui";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { SetsList } from "~/components/SetsList";
import { UploadSetForm } from "~/components/UploadSetForm";
import { fetchSetsPageData } from "~/data/sets-admin";

// Set-upload feature (PR4), edit/delete (PR6). Same "Access gates the page
// load" pattern as dashboard.tsx/notifications.tsx — this component has no
// auth logic of its own; the mutating work happens in
// routes/api/sets-presign.ts and routes/api/sets.ts, which verify the
// Access identity themselves.
export const Route = createFileRoute("/sets")({
  loader: () => fetchSetsPageData(),
  head: () => ({ meta: [{ title: "Sets · Form:at Admin" }] }),
  component: SetsPage,
});

function SetsPage() {
  const data = Route.useLoaderData();
  const router = useRouter();

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <PageTitle>sets</PageTitle>
      <SetsList
        sets={data.sets}
        recentDeletions={data.recentDeletions}
        onChanged={() => router.invalidate()}
      />
      <UploadSetForm
        onCreated={() => {
          router.invalidate();
        }}
      />
    </div>
  );
}
