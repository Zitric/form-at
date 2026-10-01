import { expect, test } from "@playwright/test";
import { gotoAndHydrate } from "./_helpers";

// One silent MP3 frame, as in player.spec.ts: <audio> needs real bytes to
// reach "playing".
const SILENT_MP3_BASE64 =
  "SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQwAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAACAAACgAB4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eAAAAAA";

test.describe("home page", () => {
  test("renders manifesto and main CTA", async ({ page }) => {
    await gotoAndHydrate(page, "/");
    await expect(
      page.locator(".Typewriter__wrapper", { hasText: /Based in Glasgow/i }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole("button", { name: /play_latest|resume_signal|pause/ }),
    ).toBeVisible();
  });

  test("the play button toggles the newest set in place, never navigating", async ({ page }) => {
    await page.route(/\.mp3(\?.*)?$/i, (route) =>
      route.fulfill({
        status: 200,
        contentType: "audio/mpeg",
        body: Buffer.from(SILENT_MP3_BASE64, "base64"),
      }),
    );
    await gotoAndHydrate(page, "/");

    await page.getByRole("button", { name: "play_latest" }).click();
    // The newest set is now loaded, so the button reads pause, or
    // resume_signal where headless Chromium reports a playback error on the
    // one-frame fixture. Either way it's the toggle for that set. Its name
    // carries the gold "›", which keeps the player bar's own control out.
    const toggle = page.getByRole("button", { name: /^›\s*(pause|resume_signal)$/ });
    await expect(toggle).toBeVisible({ timeout: 10_000 });
    // A second tap used to navigate to /sets while playing; now it only
    // toggles.
    await toggle.click();
    await expect(toggle).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  // Regression guard for "Fitting the home page on a short phone" in
  // global.css: at idle on an iPhone SE-size screen (375×667), install_app
  // must end above the bottom nav, not under it. Phone projects only: the
  // bottom nav is sm:hidden.
  test("on an iPhone SE screen install_app clears the bottom nav at idle", async ({
    page,
  }, testInfo) => {
    test.skip(
      !["mobile-chrome", "mobile-safari"].includes(testInfo.project.name),
      "phones only: the bottom nav doesn't render on desktop",
    );
    await page.setViewportSize({ width: 375, height: 667 });
    await gotoAndHydrate(page, "/");

    const install = page.getByRole("button", { name: "[ install_app ]" });
    await expect(install).toBeVisible();
    const bottomNav = page.locator("nav").filter({ visible: true });
    await expect(bottomNav).toHaveCount(1);

    const installBox = await install.boundingBox();
    const navBox = await bottomNav.boundingBox();
    if (!installBox || !navBox) throw new Error("install_app or the bottom nav has no box");
    expect(installBox.y + installBox.height).toBeLessThanOrEqual(navBox.y);
  });

  test("renders instagram link and bookings modal trigger", async ({ page }) => {
    await gotoAndHydrate(page, "/");

    const ig = page.getByRole("link", { name: /instagram/i });
    await expect(ig).toBeVisible();
    await expect(ig).toHaveAttribute("href", /instagram\.com\/form\.at_glasgow/);

    // Bookings is no longer a raw mailto link — it's a button that opens a
    // modal so users can pick gmail / outlook / mail_app / copy_email
    // instead of being forced into whatever the default mail client is.
    const bookingsTrigger = page.getByRole("button", { name: /bookings/i });
    await expect(bookingsTrigger).toBeVisible();
    await bookingsTrigger.click();
    await expect(page.getByText(/format\.gla@gmail\.com/)).toBeVisible();
    await expect(page.getByRole("link", { name: /mail_app/i })).toHaveAttribute(
      "href",
      /^mailto:format\.gla@gmail\.com/,
    );
  });
});
