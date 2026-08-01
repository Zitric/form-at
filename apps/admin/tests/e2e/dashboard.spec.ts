import { expect, test } from "@playwright/test";

// Internal, Cloudflare Access-gated page — see the top-of-file comment in
// routes/dashboard.tsx for why there's no in-app auth to test around. Lower
// priority than a public user flow: this is a smoke test confirming the
// route renders, not a full flow test. The dev server (no D1 binding) can't
// reach the analytics DB, so the loader resolves to `null` and the page
// renders its documented fallback — asserting on that fallback is itself
// proof the route mounts and the no-data path (same one a fresh Cloudflare
// Pages deploy hits before its D1 binding is wired up) doesn't crash.
//
// Phase C (tabs/grid/charts) left these assertions untouched, deliberately:
// both only exercise the `!stats` fallback branch, which the tab restructure
// never touches — the tabbed layout only renders inside the `stats` truthy
// branch, which this dev-server-without-D1 environment can never reach. Tab-
// switching is covered by DashboardTabs.test.tsx (Testing Library) instead;
// there's no way to exercise it here without stubbing a D1 binding into the
// e2e dev server, which is out of scope for this change.
test.describe("admin dashboard", () => {
  test("renders the page title without crashing", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: /analytics/i })).toBeVisible();
    await expect(page.getByText(/no data available/i)).toBeVisible();
  });
});
