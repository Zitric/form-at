import { expect, test } from "@playwright/test";
import { gotoAndHydrate } from "./_helpers";

test.describe("sets page", () => {
  test("renders the archive title and at least one card", async ({ page }) => {
    await gotoAndHydrate(page, "/sets");
    await expect(page.getByText(/audio_extracted/i)).toBeVisible();
    const setCards = page.locator("ul li").filter({ has: page.getByRole("button") });
    await expect(setCards.first()).toBeVisible();
  });

  // Regression lock for the 2026-07-02 first-visit hydration bug: persist's
  // merge crashed on an empty localStorage (fresh profile), `hasHydrated`
  // never flipped, and every useStoreHydrated()-gated surface — including
  // these save-for-offline buttons — stayed hidden until a manual reload
  // created the storage key. Playwright gives each test a fresh context (no
  // localStorage) and the dev server doesn't serve the SW, so a plain goto
  // IS a first visit. The `data-hydrated` marker can't catch this class of
  // bug — HydrateStore stamps it whether or not persist rehydration
  // succeeded; only the gated button itself proves the gate opened.
  test("first visit (fresh profile): save-for-offline buttons appear without a reload", async ({
    page,
  }) => {
    await gotoAndHydrate(page, "/sets");
    await expect(
      page.getByRole("button", { name: /save .* for offline listening/i }).first(),
    ).toBeVisible();
  });

  test("[ info ] link goes to the set detail page", async ({ page }) => {
    await gotoAndHydrate(page, "/sets");
    await page.locator("ul li > div[role='button']").first().click();
    await expect(page).toHaveURL(/\/sets\/.+/);
    await expect(page.getByRole("link", { name: /sets_archive/i })).toBeVisible();
  });
});
