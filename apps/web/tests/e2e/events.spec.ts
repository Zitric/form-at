import { expect, test } from "@playwright/test";

test.describe("events page", () => {
  test("renders the sequence_log section", async ({ page }) => {
    await page.goto("/events");
    await expect(page.getByText(/sequence_log/i)).toBeVisible();
  });

  test("clicking a card opens the event detail page", async ({ page }) => {
    await page.goto("/events");
    // Scope to the sequence_log section's list to avoid clicking nav buttons.
    const firstEventCard = page.locator("ul li").first().getByRole("button").first();
    await firstEventCard.click();
    await expect(page).toHaveURL(/\/events\/.+/);
    await expect(page.getByRole("link", { name: /events_archive/i })).toBeVisible();
  });

  test("event detail page shows lineup with DJ links", async ({ page }) => {
    await page.goto("/events");
    await page.locator("ul li").first().getByRole("button").first().click();
    await expect(page.getByText(/lineup/i)).toBeVisible();
    const djLink = page.locator('a[href^="/djs/"]').first();
    await expect(djLink).toBeVisible();
  });
});
