import { expect, test } from "@playwright/test";
import { gotoAndHydrate } from "./_helpers";

test.describe("events page", () => {
  test("renders the sequence_log section", async ({ page }) => {
    await gotoAndHydrate(page, "/events");
    await expect(page.getByText(/sequence_log/i)).toBeVisible();
  });

  test("clicking a card opens the event detail page", async ({ page }) => {
    await gotoAndHydrate(page, "/events");
    const firstEventCard = page.locator("ul li").first().getByRole("button").first();
    await firstEventCard.click();
    await expect(page).toHaveURL(/\/events\/.+/);
    await expect(page.getByRole("link", { name: /events_archive/i })).toBeVisible();
  });

  test("event detail page shows lineup with DJ links", async ({ page }) => {
    await gotoAndHydrate(page, "/events");
    // Click the first event in the sequence_log (past events) — upcoming
    // events may have an unconfirmed lineup and only render a placeholder.
    await page
      .locator('section:has-text("sequence_log") ul li')
      .first()
      .getByRole("button")
      .first()
      .click();
    await expect(page.getByRole("heading", { name: /lineup/i })).toBeVisible();
    const djLink = page.locator('a[href^="/djs/"]').first();
    await expect(djLink).toBeVisible();
  });
});
