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
    const controls = page.getByRole("button", { name: /^(Pause|Play)$/i });
    await expect(controls.first()).toBeVisible({ timeout: 10_000 });
  });
});
