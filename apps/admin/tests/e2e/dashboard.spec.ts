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

  test("charts render as real SVG bar charts with real dimensions", async ({ page }) => {
    await gotoAndHydrate(page, "/dashboard");
    // Growth tab has 4 TrendChart instances (3 install_funnel + 1
    // push_subscribers) — ClientOnly + the lazy import both need a real
    // hydrated browser to resolve, which is exactly what this is (unlike
    // jsdom, which needed a ResizeObserver stub — see tests/setup.ts).
    //
    // A field bug got past an earlier version of this test: it only
    // asserted the <svg> existed and passed `.toBeVisible()`, which does
    // NOT check whether something else visually overlaps it — the actual
    // bug (chart-container height collapsing to 0 in a real browser,
    // confirmed via getBoundingClientRect on a live dev server — see
    // TrendChartInner.tsx's comment) had every chart's bars painting at
    // correct sizes but *underneath* whatever page content came after,
    // since the collapsed container reserved no space for them in normal
    // flow. `.toBeVisible()` passed anyway. These assertions check the
    // actual symptom: the container's own bounding box has real height,
    // and each bar is independently visible with a real bounding box.
    const chart = page
      .locator('[data-testid="dashboard-card"] [data-testid="trend-chart"]')
      .first();
    const chartBox = await chart.boundingBox();
    expect(chartBox).not.toBeNull();
    expect(chartBox?.height).toBeGreaterThan(50);
    expect(chartBox?.width).toBeGreaterThan(50);

    const bars = page.locator('[data-testid="dashboard-card"] [data-testid="chart-bar"]');
    expect(await bars.count()).toBeGreaterThan(0);
    const firstBar = bars.first();
    await expect(firstBar).toBeVisible();
    const barBox = await firstBar.boundingBox();
    expect(barBox).not.toBeNull();
    expect(barBox?.width).toBeGreaterThan(0);

    // The specific manifestation of the original bug: two charts stacked in
    // the same card (install_funnel has 3) must not vertically overlap —
    // that's exactly what a collapsed container produces (every chart
    // painting at the same y, later ones on top).
    const charts = page.locator('[data-testid="dashboard-card"] [data-testid="trend-chart"]');
    const firstChartBox = await charts.nth(0).boundingBox();
    const secondChartBox = await charts.nth(1).boundingBox();
    expect(firstChartBox).not.toBeNull();
    expect(secondChartBox).not.toBeNull();
    expect(secondChartBox?.y ?? 0).toBeGreaterThanOrEqual(
      (firstChartBox?.y ?? 0) + (firstChartBox?.height ?? 0) - 1,
    );
  });

  test("an empty trend renders an explicit 'no data' message, not an invisible chart", async ({
    page,
  }) => {
    await gotoAndHydrate(page, "/dashboard");
    // install_funnel's dismissed_trend is the fixture's deliberate empty
    // array (SAMPLE_ADMIN_DASHBOARD_STATS.installFunnel.dismissedTrend).
    await expect(page.getByText(/no data in this window/i)).toBeVisible();
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
