import { WEB_ANALYTICS_SITE_TAG, hasWebAnalyticsSiteTag } from "@form-at/data/webAnalytics";
import { describe, expect, it } from "vitest";
import { rootHead } from "~/utils/rootHead";

// The Web Analytics beacon was previously left to Cloudflare's automatic edge
// injection, which worked and then silently stopped — collecting nothing for
// days with no failing check anywhere. Now that we inject it ourselves, these
// assertions are what make that failure mode loud instead of invisible.

type ScriptEntry = Record<string, unknown>;

function scripts(): ScriptEntry[] {
  const head = rootHead() as { scripts?: ScriptEntry[] };
  return head.scripts ?? [];
}

describe("rootHead — Cloudflare Web Analytics beacon", () => {
  it("emits the beacon only when a real site tag is configured", () => {
    const beacons = scripts().filter((s) =>
      String(s.src ?? "").includes("static.cloudflareinsights.com"),
    );

    if (hasWebAnalyticsSiteTag()) {
      expect(beacons).toHaveLength(1);
      // The token must be the shared constant, not a hardcoded copy — two
      // copies of a public identifier is the drift this export exists to stop.
      expect(String(beacons[0]["data-cf-beacon"])).toBe(
        JSON.stringify({ token: WEB_ANALYTICS_SITE_TAG }),
      );
      expect(beacons[0].defer).toBe(true);
    } else {
      // A forgotten placeholder must degrade to "no analytics" — visible —
      // rather than a beacon posting with a bogus token, which isn't.
      expect(beacons).toHaveLength(0);
    }
  });

  it("never ships the placeholder value into the page", () => {
    const serialised = JSON.stringify(scripts());
    expect(serialised).not.toContain("REPLACE_WITH_");
  });

  it("still emits the service-worker registration and install-prompt scripts", () => {
    // Regression guard for the spread that conditionally adds the beacon: an
    // error there could drop its neighbours in the same array.
    const inline = scripts()
      .map((s) => String(s.children ?? ""))
      .join("\n");
    expect(inline).toContain("serviceWorker");
    expect(inline).toContain("__deferredInstallPrompt");
  });
});
