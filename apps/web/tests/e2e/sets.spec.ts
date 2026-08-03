import { expect, test } from "@playwright/test";
import { gotoAndHydrate } from "./_helpers";

test.describe("sets page", () => {
  test("renders the archive title and at least one card", async ({ page }) => {
    await gotoAndHydrate(page, "/sets");
    await expect(page.getByText(/audio_extracted/i)).toBeVisible();
    const setCards = page.locator("ul li").filter({ has: page.getByRole("button") });
    await expect(setCards.first()).toBeVisible();
  });

  // Regression lock for the 2026-07-02 first-visit hydration bug: persist's
  // merge crashed on an empty localStorage (fresh profile), `hasHydrated`
  // never flipped, and every useStoreHydrated()-gated surface — including
  // these save-for-offline buttons — stayed hidden until a manual reload
  // created the storage key. Playwright gives each test a fresh context (no
  // localStorage) and the dev server doesn't serve the SW, so a plain goto
  // IS a first visit. The `data-hydrated` marker can't catch this class of
  // bug — HydrateStore stamps it whether or not persist rehydration
  // succeeded; only the gated button itself proves the gate opened.
  test("first visit (fresh profile): save-for-offline buttons appear without a reload", async ({
    page,
  }) => {
    await gotoAndHydrate(page, "/sets");
    await expect(
      page.getByRole("button", { name: /save .* for offline listening/i }).first(),
    ).toBeVisible();
  });

  test("[ info ] link goes to the set detail page", async ({ page }) => {
    await gotoAndHydrate(page, "/sets");
    await page.locator("ul li > div[role='button']").first().click();
    await expect(page).toHaveURL(/\/sets\/.+/);
    await expect(page.getByRole("link", { name: /sets_archive/i })).toBeVisible();
  });

  // The offline-click-nav fallback (fetchAllSetsForRoute/fetchSetForRoute in
  // ~/data/sets, PR2 2026-08) is deliberately NOT e2e-tested here. Tried it
  // first: reproducing real offline conditions in dev mode also hits an
  // unrelated, pre-existing gap — SaveForOfflineIconButton's own import
  // chain (SaveGateModal/useOfflineDownload) fails to load offline in dev
  // (Vite serves unbundled native ESM per-file; a failed import anywhere in
  // a route's transitive graph fails the WHOLE route component, not just
  // that sub-tree), which crashed the entire /sets page regardless of my
  // fix — confirmed with a throwaway debug script logging
  // `requestfailed`/`pageerror` events, unrelated to any of this PR's
  // changes. That's a real, separate bug (flagged to Julian directly, not
  // silently absorbed here) — but building an e2e test around it would mean
  // either fixing it too (real scope creep) or narrowing the test until it
  // stopped testing anything meaningful. The actual client-side-rejection
  // fix is covered directly instead, in
  // tests/unit/data/sets.test.ts, by mocking fetchAllSets/
  // fetchSetForDetailPage to reject and asserting the wrapper still
  // resolves to the snapshot — reliable, fast, and exercises the exact real
  // code path without needing dev's module graph to fully cooperate.
});
