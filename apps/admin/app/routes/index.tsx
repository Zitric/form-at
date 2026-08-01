import { createFileRoute, redirect } from "@tanstack/react-router";

// "/" isn't a section on its own — dashboard is the only section today,
// but more will land here later (notifications, sessions), so this just
// forwards to the first one rather than 404ing or duplicating its content.
export const Route = createFileRoute("/")({
  loader: () => {
    throw redirect({ to: "/dashboard" });
  },
});
