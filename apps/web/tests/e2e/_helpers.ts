import type { Page } from "@playwright/test";

// Headless browsers in CI can fire clicks before React attaches event handlers
// to interactive elements. The root layout sets `body[data-hydrated="true"]`
// once its mount effect runs — wait for that before any click.
export async function gotoAndHydrate(page: Page, url: string) {
  await page.goto(url);
  await page.locator("body[data-hydrated='true']").waitFor({ timeout: 10_000 });
}
