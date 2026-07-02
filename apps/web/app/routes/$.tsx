import { createFileRoute } from "@tanstack/react-router";
import { NotFoundPage } from "~/components/NotFoundPage";

// Splat route — wildcard-matches any URL not covered by a more specific
// route. Renders the shared <NotFoundPage> component so this and the
// root's `notFoundComponent` stay visually identical (see NotFoundPage.tsx
// for the "why one component" rationale).
export const Route = createFileRoute("/$")({
  component: NotFoundPage,
});
