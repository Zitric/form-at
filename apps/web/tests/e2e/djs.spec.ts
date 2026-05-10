import { expect, test } from "@playwright/test";

test.describe("djs page", () => {
  test("renders both sections (residents + guests)", async ({ page }) => {
    await page.goto("/djs");
    await expect(page.getByText(/system_architects/i)).toBeVisible();
    await expect(page.getByText(/guest_transmissions/i)).toBeVisible();
  });

  test("clicking a DJ card opens their profile", async ({ page }) => {
    await page.goto("/djs");
    await page.locator("ul li").first().getByRole("button").first().click();
    await expect(page).toHaveURL(/\/djs\/.+/);
    await expect(page.getByRole("link", { name: /djs_collective/i })).toBeVisible();
  });
});
