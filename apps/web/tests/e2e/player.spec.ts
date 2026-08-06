import { expect, test } from "@playwright/test";
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
});
