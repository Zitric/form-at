import { describe, expect, it } from "vitest";
import { stripAppContext } from "~/utils/appContext";

// Locks the pure half of the H1 fix (2026-07-02): the SW audio handler
// branches on `stripAppContext` and uses `bareUrl` as the IDB key. The
// network path always forwards the ORIGINAL request object (never a rebuilt
// one — rebuilding drops the Range header under the request-no-cors guard),
// so this marker logic is the only URL manipulation left in the handler.

import { AUDIO_ORIGIN } from "~/utils/audioHost";

const R2 = AUDIO_ORIGIN;

describe("stripAppContext", () => {
  it("bare URL (tab): not app context, URL unchanged", () => {
    const url = `${R2}/002/Form_at%20002%20-%20t.i.l.mp3`;
    expect(stripAppContext(new URL(url))).toEqual({ ctxIsApp: false, bareUrl: url });
  });

  it("marked URL (standalone): app context, marker stripped with no trailing '?'", () => {
    const bare = `${R2}/002/Form_at%20002%20-%20t.i.l.mp3`;
    expect(stripAppContext(new URL(`${bare}?ctx=app`))).toEqual({ ctxIsApp: true, bareUrl: bare });
  });

  it("keeps unrelated query params while stripping the marker", () => {
    const result = stripAppContext(new URL(`${R2}/a.mp3?foo=1&ctx=app`));
    expect(result.ctxIsApp).toBe(true);
    expect(result.bareUrl).toBe(`${R2}/a.mp3?foo=1`);
  });

  it("does not treat other ctx values as app context", () => {
    const url = `${R2}/a.mp3?ctx=web`;
    expect(stripAppContext(new URL(url))).toEqual({ ctxIsApp: false, bareUrl: url });
  });

  it("round-trips: stripping a URL that withAppContext marked yields the sets.ts src", async () => {
    // withAppContext needs window (isStandalone) — jsdom provides it here.
    const { withAppContext } = await import("~/utils/audioUrl");
    const src = `${R2}/002/Form_at%20002%20-%20hubey.mp3`;
    // jsdom's matchMedia stub reports non-standalone → withAppContext is a
    // no-op in tests; simulate the standalone marker directly instead.
    const marked = new URL(withAppContext(src));
    marked.searchParams.set("ctx", "app");
    expect(stripAppContext(marked).bareUrl).toBe(src);
  });
});
