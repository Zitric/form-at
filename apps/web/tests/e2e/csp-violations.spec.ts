import { AUDIO_ORIGIN } from "@form-at/data/sets";
import { expect, test } from "@playwright/test";
import { gotoAndHydrate } from "./_helpers";

// Three real CSP gaps have been found in this project so far — apps/admin's
// media-src blob: (the upload duration-read), apps/admin's connect-src for
// R2 (the presigned PUT), and this app's img-src for the artwork CDN
// fallback — every one of them found by hand, by someone actually using the
// feature and reading the console. This is the pattern-breaker: run against
// this app's own dev server (`pnpm dev`), not a production build — the CSP
// header is set unconditionally inside `server.ts`'s fetch handler and is
// present identically under plain `vite dev`, confirmed by curling it
// directly. TECH_DEBT.md item 27 (the deferred production-build Playwright
// project) is unrelated: that's specifically about the service worker,
// which genuinely doesn't exist under `vite dev` — nothing here needs it.
//
// `securitypolicyviolation`, not console-text parsing. A CSP violation's
// console phrasing differs by engine — Firefox says "The page's settings
// blocked...", Chromium says "Refused to load...". `securitypolicyviolation`
// is the one thing every engine fires identically, with the violated
// directive and blocked URI as real fields, not a string to regex. Checked
// directly, not assumed: a deliberately-disallowed host reliably fires this
// event in both Chromium AND WebKit (Playwright's two underlying engines —
// mobile-chrome/mobile-safari are the same two engines under different
// device emulation, so nothing further to check there). Installed via
// `page.addInitScript()` so the listener exists before any page script
// runs, including whatever fires during hydration.

function installViolationListener(page: import("@playwright/test").Page) {
  return page.addInitScript(() => {
    (window as unknown as { __cspViolations: unknown[] }).__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      (window as unknown as { __cspViolations: unknown[] }).__cspViolations.push({
        violatedDirective: e.violatedDirective,
        blockedURI: e.blockedURI,
      });
    });
  });
}

async function getViolations(page: import("@playwright/test").Page) {
  return page.evaluate(() => (window as unknown as { __cspViolations: unknown[] }).__cspViolations);
}

test.describe("CSP violations", () => {
  test("the golden path (home, sets, a set detail page) produces zero CSP violations", async ({
    page,
  }) => {
    await installViolationListener(page);
    await gotoAndHydrate(page, "/");
    await gotoAndHydrate(page, "/sets");
    await page.locator("ul li > div[role='button']").first().click();
    await page.waitForURL(/\/sets\/.+/);
    await page.waitForTimeout(500);

    expect(await getViolations(page)).toEqual([]);
  });

  // The design decision worth being explicit about: this forces
  // Image.tsx's optimized-artwork failure path (route-intercepting the
  // `<picture>`'s own requests), because a plain page load never touches
  // this at all — every set on the fixture catalogue already has its
  // optimized variants, so the failure branch simply never runs, and a
  // regression there would pass silently.
  //
  // This does NOT reach Image.tsx's originalUrl (CDN) fallback
  // specifically — that would need a fixture set with `artworkOriginalUrl`
  // populated, and none in the committed snapshot has one. Getting there
  // was attempted two different ways and both were real dead ends, not
  // skipped for convenience: (1) intercepting the detail page's
  // `_serverFn` response and patching the added-key into its JSON — the
  // patched key never reaches the rendered component, because TanStack
  // Start's client deserializer binds the response against a shape
  // resolved at build time, not by reading whatever keys the wire payload
  // happens to carry; confirmed by patching successfully (verified the
  // modified JSON left the route handler intact) and then observing the
  // fallback `<img>` never appears in the DOM. (2) intercepting the
  // network request for `sets.generated.ts` itself (Vite dev serves it as
  // a real, unbundled ESM fetch) — this can't work either: the data that
  // actually reaches this response is read by the SERVER's own Node
  // process during SSR/serverFn dispatch, which never goes through the
  // browser's network layer Playwright can intercept. The one mechanism
  // that WOULD work — editing the committed `sets.generated.ts` on disk
  // for the duration of the test — was deliberately not done: this repo's
  // own editor has auto-committed and auto-pushed mid-session more than
  // once, and a crash between the edit and its revert would risk pushing
  // a mutated, committed data file. The direct host-allowance test below
  // covers the actual regression risk (img-src missing the CDN host)
  // without that risk.
  test("a failed optimized image doesn't itself produce a CSP violation or break the page", async ({
    page,
  }) => {
    await installViolationListener(page);
    await page.route("**/images/**", (route) => route.abort("failed"));

    await gotoAndHydrate(page, "/sets");
    await page.locator("ul li > div[role='button']").first().click();
    await page.waitForURL(/\/sets\/.+/);
    await page.waitForTimeout(500);

    // The page itself must still be usable — Image.tsx degrading to `null`
    // (no originalUrl for this fixture) must not take the rest of the
    // route down with it.
    await expect(page.getByRole("button", { name: /play_set|now_playing/i })).toBeVisible();
    expect(await getViolations(page)).toEqual([]);
  });

  // The test that actually would have caught the regression this app
  // shipped: a direct request to each external host this app's CSP is
  // supposed to allow, made from inside the live page so the real,
  // currently-deployed policy is what's being checked — not a header
  // string, which can say the right thing and still be wrong about what it
  // actually permits (see server.ts's own CSP for a case in point: the
  // wildcard vs literal hostname question is exactly this class of gap).
  // Deliberately fake paths on real hosts (`/csp-test-probe`) — this only
  // needs the ORIGIN to be allowed, not the resource to exist, so it can't
  // start failing just because real catalogue content changes.
  //
  // Each host is requested with the SAME kind of resource its own directive
  // actually governs — CSP enforces per resource type, not just per host.
  // First draft of this test used `<img>` for all three and got two real,
  // CORRECT violations back: `static.cloudflareinsights.com` and
  // `cloudflareinsights.com` are allowed under script-src/connect-src, not
  // img-src, so requesting them as images is genuinely disallowed and
  // should be — that failure was this test catching its own wrong
  // assumption, not the app's.
  test("every externally-allowed host in this app's CSP is actually reachable", async ({
    page,
  }) => {
    await installViolationListener(page);
    await gotoAndHydrate(page, "/");

    await page.evaluate(async (audioOrigin) => {
      // img-src / media-src / connect-src — the exact host the img-src gap
      // was missing (TECH_DEBT.md's entry on it).
      const img = document.createElement("img");
      img.src = `${audioOrigin}/csp-test-probe.png`;
      document.body.appendChild(img);

      // script-src — the Web Analytics beacon script's own host.
      const script = document.createElement("script");
      script.src = "https://static.cloudflareinsights.com/csp-test-probe.js";
      document.body.appendChild(script);

      // connect-src — the beacon's own report endpoint, requested the way
      // beacon.min.js actually requests it (fetch/XHR), not as a script or
      // image — a fetch to a disallowed connect-src host throws, so this
      // must not throw for an ALLOWED one. CORS/404 are expected and fine;
      // a CSP block is not.
      try {
        await fetch("https://cloudflareinsights.com/csp-test-probe");
      } catch {
        // A CORS or network rejection is expected for a fake path — only a
        // securitypolicyviolation event (asserted below) means CSP is at fault.
      }
    }, AUDIO_ORIGIN);
    await page.waitForTimeout(1000);

    expect(await getViolations(page)).toEqual([]);
  });

  // Negative control. Without this, every test above would pass just as
  // well if `securitypolicyviolation` silently never fired for any reason
  // (an engine quirk, a typo in the event name) — this proves the
  // detection mechanism itself is live, not merely that nothing happened.
  test("a genuinely disallowed host DOES produce a CSP violation — proves the check isn't vacuous", async ({
    page,
  }) => {
    await installViolationListener(page);
    await gotoAndHydrate(page, "/");

    await page.evaluate(() => {
      const img = document.createElement("img");
      img.src = "https://example.com/definitely-not-allowed.png";
      document.body.appendChild(img);
    });
    await page.waitForTimeout(1000);

    const violations = await getViolations(page);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({ violatedDirective: "img-src" });
  });
});
