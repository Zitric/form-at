import { expect, test } from "@playwright/test";
import { gotoAndHydrate } from "./_helpers";

// Internal, Cloudflare Access-gated page — see the top-of-file comment in
// routes/dashboard.tsx for why there's no in-app auth to test around.
//
// Since the sample-data fallback landed (admin-stats.ts's
// pickStatsForMissingDb), the dev server this suite runs against no longer
// hits the `!stats` branch at all: with no D1 binding AND no Cloudflare env
// (plain `vite dev`, which is what Playwright's webServer boots), the loader
// now returns SAMPLE_ADMIN_DASHBOARD_STATS instead of `null`. That's WHY
// this suite can finally exercise tabs, the grid, and charts — the earlier
// comment here (removed) explained the opposite: that tabs were
// UNREACHABLE from e2e because the dev server could only ever hit the
// no-data fallback. That reasoning no longer holds.
test.describe("admin dashboard", () => {
  test("renders the page title and the sample-data marker", async ({ page }) => {
    await gotoAndHydrate(page, "/dashboard");
    await expect(page.getByRole("heading", { name: /analytics/i })).toBeVisible();
    // Proves we're in the fixture path, not a fluke of real data — also the
    // literal marker Julian asked for so sample numbers can't be mistaken
    // for real ones.
    await expect(page.getByText(/sample data/i)).toBeVisible();
  });

  test("growth tab is selected by default and shows its content", async ({ page }) => {
    await gotoAndHydrate(page, "/dashboard");
    await expect(page.getByRole("tab", { name: /growth/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByText("// install_funnel")).toBeVisible();
    await expect(page.getByText("// push_subscribers")).toBeVisible();
  });

  test("switching tabs swaps the visible content", async ({ page }) => {
    await gotoAndHydrate(page, "/dashboard");

    await page.getByRole("tab", { name: /usage/i }).click();
    await expect(page.getByRole("tab", { name: /usage/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByText("// app_launches")).toBeVisible();
    await expect(page.getByText("// plays")).toBeVisible();
    await expect(page.getByText("// install_funnel")).toHaveCount(0);

    await page.getByRole("tab", { name: /sets/i }).click();
    await expect(page.getByText("// per_set_plays")).toBeVisible();
    await expect(page.getByText("// clicks")).toBeVisible();
    await expect(page.getByText("// app_launches")).toHaveCount(0);
  });

  test("the per-set picker keeps its selection across a tab round trip", async ({ page }) => {
    await gotoAndHydrate(page, "/dashboard");
    await page.getByRole("tab", { name: /sets/i }).click();

    // t.i.l. isn't the default selection (topSets[0] in the fixture is
    // hubey) — picking it proves the click actually changed the selection,
    // not just that something was already selected. Buttons render as
    // "[ t.i.l. ]" (Button wraps children in BracketLabel), hence the regex.
    await page.getByRole("button", { name: /t\.i\.l\./ }).click();
    await expect(page.getByText(/avg_engaged_listening is cumulative/i)).toBeVisible();

    await page.getByRole("tab", { name: /growth/i }).click();
    await page.getByRole("tab", { name: /sets/i }).click();
    // Still showing the same set's data, not reset to the default —
    // the state-lifting behavior locked by SetsTab.state-lifting.test.tsx,
    // now also observed end-to-end in a real browser.
    await expect(page.getByText(/avg_engaged_listening is cumulative/i)).toBeVisible();
  });

  test("charts render as real SVG bar charts", async ({ page }) => {
    await gotoAndHydrate(page, "/dashboard");
    // Growth tab has 4 TrendChart instances (3 install_funnel + 1
    // push_subscribers) — ClientOnly + the lazy import both need a real
    // hydrated browser to resolve, which is exactly what this is (unlike
    // jsdom, which needed a ResizeObserver stub — see tests/setup.ts).
    const charts = page.locator('[data-testid="dashboard-card"] svg[aria-hidden="true"]');
    await expect(charts.first()).toBeVisible();
    expect(await charts.count()).toBeGreaterThanOrEqual(4);
  });

  test("the card grid collapses to one column at 375px (iPhone SE)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoAndHydrate(page, "/dashboard");

    const cards = page.getByTestId("dashboard-card");
    const first = await cards.nth(0).boundingBox();
    const second = await cards.nth(1).boundingBox();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    // One column: same left edge, stacked vertically below each other.
    expect(second?.y).toBeGreaterThan((first?.y ?? 0) + (first?.height ?? 0) - 1);
    expect(Math.abs((second?.x ?? 0) - (first?.x ?? 0))).toBeLessThan(1);
  });

  test("the card grid is two columns at desktop width", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoAndHydrate(page, "/dashboard");

    const cards = page.getByTestId("dashboard-card");
    const first = await cards.nth(0).boundingBox();
    const second = await cards.nth(1).boundingBox();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    // Two columns: same row (y roughly aligned), side by side (different x).
    expect(Math.abs((second?.y ?? 0) - (first?.y ?? 0))).toBeLessThan(1);
    expect(second?.x ?? 0).toBeGreaterThan(first?.x ?? 0);
  });
});
