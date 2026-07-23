import { expect, test } from "@playwright/test";
import { gotoAndHydrate } from "./_helpers";

test.describe("djs page", () => {
  test("renders both sections (residents + guests)", async ({ page }) => {
    await gotoAndHydrate(page, "/djs");
    await expect(page.getByText(/system_architects/i)).toBeVisible();
    await expect(page.getByText(/guest_operators/i)).toBeVisible();
  });

  test("clicking a DJ card opens their profile", async ({ page }) => {
    await gotoAndHydrate(page, "/djs");
    await page.locator("ul li").first().getByRole("button").first().click();
    await expect(page).toHaveURL(/\/djs\/.+/);
    await expect(page.getByRole("link", { name: /djs_collective/i })).toBeVisible();
  });

  // Regression lock for the "Set card abstraction" fix (PWA_PROGRESS.md,
  // field-confirmed 2026-07-06): the DJ page's "played by this DJ" list used
  // to render a DIFFERENT card component than /sets, missing the
  // save-for-offline icon entirely — there was no way to save a set for
  // offline from a DJ's page. Both surfaces now render the same `SetCard`,
  // so this asserts the exact button role/name `sets.spec.ts` already locks
  // for the /sets listing, here on the DJ page instead.
  test("DJ page's audio_logs section now shows the save-for-offline icon (was missing)", async ({
    page,
  }) => {
    // Click-through from the list, not a direct URL (no existing test in
    // this suite navigates straight to a dynamic detail route — see
    // events.spec.ts's equivalent comment). Targets Julz Lever by name
    // specifically: not every DJ has `setIds`, and only one with sets
    // actually renders the audio_logs section this test needs.
    await gotoAndHydrate(page, "/djs");
    await page.getByRole("button", { name: /julz lever/i }).click();
    await expect(page.getByRole("heading", { name: /audio_logs/i })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /save .* for offline listening/i }).first(),
    ).toBeVisible();
  });
});
