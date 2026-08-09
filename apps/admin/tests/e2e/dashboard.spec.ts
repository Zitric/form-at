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

  test("usage tab is selected by default and shows its content", async ({ page }) => {
    await gotoAndHydrate(page, "/dashboard");
    await expect(page.getByRole("tab", { name: /usage/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByText("// app_launches")).toBeVisible();
    await expect(page.getByText("// plays")).toBeVisible();
  });

  test("switching tabs swaps the visible content", async ({ page }) => {
    await gotoAndHydrate(page, "/dashboard");

    // Starts from `usage` (the default), so the first click must move AWAY
    // from it — clicking `usage` here would be a no-op and prove nothing.
    await page.getByRole("tab", { name: /growth/i }).click();
    await expect(page.getByRole("tab", { name: /growth/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByText("// install_funnel")).toBeVisible();
    await expect(page.getByText("// push_subscribers")).toBeVisible();
    await expect(page.getByText("// app_launches")).toHaveCount(0);

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
    // `usage` is the landing tab, so every growth-specific assertion below
    // needs an explicit switch first.
    await page.getByRole("tab", { name: /growth/i }).click();
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
    await page.getByRole("tab", { name: /growth/i }).click();
    // install_funnel's dismissed_trend is the fixture's deliberate empty
    // array (SAMPLE_ADMIN_DASHBOARD_STATS.installFunnel.dismissedTrend).
    await expect(page.getByText(/no data in this window/i)).toBeVisible();
  });

  test("an all-zero trend shows a real chart frame plus an explicit 'no activity' note", async ({
    page,
  }) => {
    await gotoAndHydrate(page, "/dashboard");
    await page.getByRole("tab", { name: /usage/i }).click();
    // app_launches.weeklyTrend is the fixture's deliberate all-zero array —
    // the note is what keeps a flat, real chart frame from reading as
    // broken next to "total: 63" on the same card.
    await expect(page.getByText(/no activity in this window/i)).toBeVisible();
    // .first() (in document order), not a `> svg` direct-child selector —
    // @visx/text wraps each tick label in its own nested <svg> for
    // measurement, so the chart wrapper's svg descendants are [outer chart
    // svg, then one per tick label]; `.first()` is always the outer one
    // since it's the ancestor of the rest. gotoAndHydrate only proves the
    // root hydrated, not that this specific lazy-loaded chart chunk finished
    // rendering — `.toBeVisible()`'s auto-retry covers that gap.
    const chart = page.locator('[data-testid="trend-chart"]').first();
    await expect(chart.locator("svg").first()).toBeVisible();
  });

  test("y-axis ticks are whole numbers, never fractional", async ({ page }) => {
    await gotoAndHydrate(page, "/dashboard");
    await page.getByRole("tab", { name: /growth/i }).click();
    // accepted_trend's max is 2 — the exact case that regressed to 5
    // fractional ticks (0, 0.5, 1, 1.5, 2) under d3's default tick step.
    const acceptedTrendChart = page
      .locator('[data-testid="dashboard-card"] [data-testid="trend-chart"]')
      .nth(1);
    // Wait for the chart to actually finish its lazy import + render before
    // reading tick text — a one-shot `.allTextContents()` doesn't auto-retry
    // the way `.toBeVisible()` does, so it can fire before the chunk loads.
    await expect(acceptedTrendChart.locator("svg").first()).toBeVisible();
    const tickTexts = await acceptedTrendChart.locator("text").allTextContents();
    const numericTicks = tickTexts.filter((t) => /^\d+(\.\d+)?$/.test(t));
    expect(numericTicks.length).toBeGreaterThan(0);
    for (const tick of numericTicks) {
      expect(tick).not.toContain(".");
    }
  });

  test("cards size to their own content instead of stretching to match a sibling", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await gotoAndHydrate(page, "/dashboard");
    await page.getByRole("tab", { name: /growth/i }).click();
    // install_funnel (3 stacked charts) and push_subscribers (1 chart) sit
    // in the same grid row. Before `items-start`, CSS Grid's default
    // `align-items: stretch` forced push_subscribers as tall as
    // install_funnel, leaving a large empty void under its own content.
    // Wait for charts to actually render first — comparing card heights
    // before the lazy-loaded chart chunk resolves would compare two
    // "chart pending" fallbacks instead of the real content.
    await expect(page.locator('[data-testid="trend-chart"] svg').first()).toBeVisible();
    const cards = page.getByTestId("dashboard-card");
    const installFunnelBox = await cards.nth(0).boundingBox();
    const pushSubscribersBox = await cards.nth(1).boundingBox();
    expect(installFunnelBox).not.toBeNull();
    expect(pushSubscribersBox).not.toBeNull();
    expect(pushSubscribersBox?.height ?? 0).toBeLessThan((installFunnelBox?.height ?? 0) * 0.7);
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
    // Card 0 is the full-width `totals` summary (md:col-span-2), so the
    // two-column assertion applies to the first pair BELOW it.
    const totals = await cards.nth(0).boundingBox();
    const first = await cards.nth(1).boundingBox();
    const second = await cards.nth(2).boundingBox();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    // Two columns: same row (y roughly aligned), side by side (different x).
    expect(Math.abs((second?.y ?? 0) - (first?.y ?? 0))).toBeLessThan(1);
    expect(second?.x ?? 0).toBeGreaterThan(first?.x ?? 0);
    // The totals card really does span both columns — wider than either of
    // the two beneath it, not merely first in the grid.
    expect(totals?.width ?? 0).toBeGreaterThan((first?.width ?? 0) * 1.5);
  });

  test("the totals card and its rows fit at 375px with no horizontal overflow", async ({
    page,
  }) => {
    // iPhone SE width — CLAUDE.md's stated narrow-viewport test case. A
    // full-width card of label/value rows is the most likely thing to push
    // the page wider than the viewport.
    await page.setViewportSize({ width: 375, height: 800 });
    await gotoAndHydrate(page, "/dashboard");

    await expect(page.getByText("// totals")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("edge_traffic's chart is weekly-bucketed, not a daily series", async ({ page }) => {
    await gotoAndHydrate(page, "/dashboard");
    // The shipped bug rendered 60 daily values as "60 weeks" with a ~413-day
    // axis. The fixture's 30-day window must read as 5 weekly buckets. The
    // sr-only caption in TrendChartInner is where the bucket count is stated
    // in text, so it's the assertable surface for the units.
    await expect(page.getByText("// edge_traffic")).toBeVisible();
    // Scoped to the edge_traffic card: the visits card beside it also renders a
    // 5-bucket chart, so an unscoped match hits two elements.
    const edgeCard = page.getByTestId("dashboard-card").filter({ hasText: "// edge_traffic" });
    await expect(edgeCard.getByText(/^5 weeks, latest /)).toBeVisible();
    // Nothing on the page should claim a bucket count anywhere near a raw
    // daily series for a 30- or 60-day window.
    await expect(page.getByText(/\b(30|60) weeks,/)).toHaveCount(0);
  });

  test("visits card states what a visit is and that bots are excluded", async ({ page }) => {
    await gotoAndHydrate(page, "/dashboard");
    await expect(page.getByText("// visits")).toBeVisible();
    // The definition is the whole disclosure: a visit is an arrival, not a
    // session and not a person.
    await expect(page.getByText(/arriving from a different site or a direct link/i)).toBeVisible();
    await expect(page.getByText(/can't count distinct humans/i)).toBeVisible();
    // Sits beside edge_traffic so the gap between the two is visible.
    await expect(page.getByText("// edge_traffic")).toBeVisible();
  });

  test("edge_traffic is labelled as edge requests, never as visitors", async ({ page }) => {
    await gotoAndHydrate(page, "/dashboard");
    await expect(page.getByText("// edge_traffic")).toBeVisible();
    // The caption is what stops someone reading this as people, or as a bug
    // when it disagrees with Cloudflare Web Analytics — see cf-analytics.ts.
    await expect(page.getByText(/including bots, crawlers and asset requests/i)).toBeVisible();
    await expect(page.getByText(/\bvisitors\b/i)).toHaveCount(0);
  });
});
