import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export async function getRouter() {
  return createTanStackRouter({ routeTree, scrollRestoration: true });
}

declare module "@tanstack/react-start" {
  interface Register {
    router: Awaited<ReturnType<typeof getRouter>>;
  }
}
