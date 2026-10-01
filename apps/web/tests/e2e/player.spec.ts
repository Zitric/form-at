import { sets } from "@form-at/data/sets";
import { type Page, expect, test } from "@playwright/test";
import { gotoAndHydrate } from "./_helpers";

const SILENT_MP3_BASE64 =
  "SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQwAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAACAAACgAB4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eAAAAAA";

test.describe("player", () => {
  test.beforeEach(async ({ page }) => {
    await page.route(/\.mp3(\?.*)?$/i, (route) =>
      route.fulfill({
        status: 200,
        contentType: "audio/mpeg",
        body: Buffer.from(SILENT_MP3_BASE64, "base64"),
      }),
    );
  });

  test("audio element is mounted at the root", async ({ page }) => {
    await gotoAndHydrate(page, "/");
    await expect(page.locator("audio")).toBeAttached();
  });

  test("clicking a set card mounts player controls", async ({ page }) => {
    await gotoAndHydrate(page, "/sets");
    await page.locator("ul li").first().getByRole("button").first().click();
    const controls = page.getByRole("button", { name: /Pause|Play/i });
    await expect(controls.first()).toBeVisible({ timeout: 10_000 });
  });

  // Regression lock: tapping open_set_details from the FullPlayer overlay can
  // have its navigation UNDONE (the overlay's
  // history-marker cleanup raced TanStack's microtask-deferred pushState and
  // fired history.back()) and the resulting <500ms double navigation
  // stranded useRouteTransition at opacity-0 — black content at /sets under
  // visible chrome. PASS = we land on the detail page and the content
  // actually reaches full opacity.
  test("full player open_set_details lands on the detail page with visible content", async ({
    page,
    isMobile,
  }) => {
    test.skip(!isMobile, "FullPlayer overlay is mobile-only");
    await gotoAndHydrate(page, "/sets");
    await page.getByRole("button", { name: "Play set", exact: true }).first().click();

    await page.locator("[aria-label='Open now playing']").tap();
    const detailsLink = page.getByRole("link", { name: /open_set_details/i });
    await expect(detailsLink).toBeVisible();
    await detailsLink.tap();

    await expect(page).toHaveURL(/\/sets\/.+/);
    await expect(page.getByRole("link", { name: /sets_archive/i })).toBeVisible();
    await expect(page.locator("main")).toHaveCSS("opacity", "1", { timeout: 5000 });
  });

  // TECH_DEBT 31: cached peaks are stamped with the URL they came from, so a
  // re-upload (new versioned URLs) makes the player fetch the new peaks
  // instead of drawing the old file's waveform forever. Desktop player only:
  // it's the one that mounts the waveform seeker for a restored track.
  test.describe("cached peaks stamped with their URL", () => {
    const set = sets.find((s) => s.peaks);
    if (!set?.peaks) throw new Error("the snapshot needs a set with peaks");
    const peaksPath = new URL(set.peaks).pathname;

    async function restoreWithCachedPeaks(page: Page, stampedUrl: string) {
      await page.addInitScript(
        ({ id, url }) => {
          localStorage.setItem(
            "format-player",
            JSON.stringify({
              state: {
                nowPlayingId: id,
                positions: {},
                peaksCache: { [id]: { url, peaks: [0.2, 0.4, 0.6] } },
                durations: {},
                offlineSets: {},
                hasRequestedPersist: false,
              },
              version: 0,
            }),
          );
        },
        { id: set?.id, url: stampedUrl },
      );
      const requested: string[] = [];
      await page.route(
        (url) => url.pathname === peaksPath,
        (route) => {
          requested.push(route.request().url());
          return route.fulfill({ contentType: "application/json", body: '{"peaks":[0.5,0.5]}' });
        },
      );
      await gotoAndHydrate(page, "/sets");
      return requested;
    }

    test("a stamp from another URL (a re-upload) is refetched", async ({ page, isMobile }) => {
      test.skip(isMobile, "the waveform seeker is the desktop player's");
      const requested = await restoreWithCachedPeaks(
        page,
        "https://cdn.formatglasgow.com/sets/old/peaks.json",
      );
      await expect.poll(() => requested.length, { timeout: 10_000 }).toBeGreaterThan(0);
    });

    // The control: without it, the test above would also pass if peaks were
    // simply always refetched.
    test("a stamp matching the set's peaks URL is used as it is", async ({ page, isMobile }) => {
      test.skip(isMobile, "the waveform seeker is the desktop player's");
      const requested = await restoreWithCachedPeaks(page, set?.peaks ?? "");
      await page.waitForTimeout(3000);
      expect(requested).toEqual([]);
    });
  });
});
