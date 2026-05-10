import { expect, test } from "@playwright/test";
import { gotoAndHydrate } from "./_helpers";

test.describe("sets page", () => {
  test("renders the archive title and at least one card", async ({ page }) => {
    await gotoAndHydrate(page, "/sets");
    await expect(page.getByText(/audio_extracted/i)).toBeVisible();
    const infoLinks = page.getByRole("link", { name: /\[\s*info\s*\]/ });
    await expect(infoLinks.first()).toBeVisible();
  });

  test("[ info ] link goes to the set detail page", async ({ page }) => {
    await gotoAndHydrate(page, "/sets");
    await page
      .getByRole("link", { name: /\[\s*info\s*\]/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/sets\/.+/);
    await expect(page.getByRole("link", { name: /sets_archive/i })).toBeVisible();
  });
});
