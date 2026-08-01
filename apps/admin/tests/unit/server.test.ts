import { describe, expect, it } from "vitest";
import server from "~/server";

// Only the guard's rejection path is testable here: it short-circuits before
// createStartHandler ever runs. The allowed-host pass-through hits the same
// harness gap as sw.ts — createStartHandler resolves a virtual module
// (`#tanstack-router-entry`) that only exists under the tanstackStart Vite
// plugin, not plain vitest+jsdom (confirmed: it throws
// ERR_PACKAGE_IMPORT_NOT_DEFINED outside that plugin). See PWA_PROGRESS.md's
// admin section for the manual verification step covering that path.
describe("server.fetch host guard", () => {
  it("404s a request to the Cloudflare Pages default domain without invoking the SSR handler", async () => {
    const res = await server.fetch(
      new Request("https://form-at-admin.pages.dev/dashboard"),
      undefined,
    );
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("");
  });

  it("404s a per-deployment preview URL", async () => {
    const res = await server.fetch(
      new Request("https://cd9a05fe.form-at-admin.pages.dev/dashboard"),
      undefined,
    );
    expect(res.status).toBe(404);
  });
});
