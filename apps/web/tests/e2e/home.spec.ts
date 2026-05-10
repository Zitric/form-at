import { expect, test } from "@playwright/test";
import { gotoAndHydrate } from "./_helpers";

test.describe("home page", () => {
  test("renders manifesto and main CTA", async ({ page }) => {
    await gotoAndHydrate(page, "/");
    await expect(page.getByText(/Based in Glasgow/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /access_audio|resume_signal/ })).toBeVisible();
  });

  test("renders instagram and bookings social links", async ({ page }) => {
    await gotoAndHydrate(page, "/");
    const ig = page.getByRole("link", { name: /instagram/i });
    const mail = page.getByRole("link", { name: /bookings/i });
    await expect(ig).toBeVisible();
    await expect(ig).toHaveAttribute("href", /instagram\.com\/form\.at_glasgow/);
    await expect(mail).toBeVisible();
    await expect(mail).toHaveAttribute("href", /mailto:format\.gla@gmail\.com/);
  });
});
