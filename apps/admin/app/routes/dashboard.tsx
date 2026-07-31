import { PageTitle } from "@form-at/ui";
import { createFileRoute } from "@tanstack/react-router";

// Placeholder — replaced with the full migrated dashboard (metrics, per-set
// picker, honesty captions) in the next commit. Kept as a real, working
// route here so the redirect from "/" has somewhere valid to land.
export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard · Form:at Admin" }] }),
  component: Dashboard,
});

function Dashboard() {
  return (
    <div className="p-6">
      <PageTitle>dashboard</PageTitle>
    </div>
  );
}
