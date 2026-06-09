import { expect, test } from "@playwright/test";
import { gotoAndHydrate } from "./_helpers";

test.describe("home page", () => {
  test("renders manifesto and main CTA", async ({ page }) => {
    await gotoAndHydrate(page, "/");
    await expect(
      page.locator(".Typewriter__wrapper", { hasText: /Based in Glasgow/i }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /access_audio|resume_signal/ })).toBeVisible();
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
