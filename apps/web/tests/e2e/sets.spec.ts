import { expect, test } from "@playwright/test";
import { gotoAndHydrate } from "./_helpers";

test.describe("sets page", () => {
  test("renders a set's title as its group heading, and at least one card", async ({ page }) => {
    await gotoAndHydrate(page, "/sets");
    // Sets are grouped by their own `title` field — asserting a real,
    // stable catalogue title here, not a placeholder. This test used to
    // assert `/audio_extracted/i`, a hardcoded string that had replaced the
    // group's actual title in every section's heading; it passed precisely
    // because the bug was present, not despite it.
    await expect(page.getByText("Form:at 002")).toBeVisible();
    const setCards = page.locator("ul li").filter({ has: page.getByRole("button") });
    await expect(setCards.first()).toBeVisible();
  });

  // Regression lock for the first-visit hydration bug: persist's merge crashes
  // on an empty localStorage (fresh profile), `hasHydrated` never flips, and
  // every useStoreHydrated()-gated surface — including
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
  // ~/data/sets) is deliberately NOT e2e-tested here, because Playwright drives
  // the DEV server and offline can't be faked there without hitting a
  // dev-only failure that swamps what's under test.
  //
  // The mechanism: Vite dev serves unbundled native ESM, one request per
  // module, so going offline fails whichever imports haven't loaded yet — and a
  // failed import anywhere in a route's transitive graph fails the WHOLE route
  // component, not just that sub-tree. SaveForOfflineIconButton's chain
  // (SaveGateModal/useOfflineDownload) is enough to take out all of /sets.
  // Production doesn't behave this way: the service worker precaches the built,
  // hashed chunks, so the route's graph is already local. It is a limitation of
  // testing offline against dev, not a bug in the app — see TECH_DEBT.md item
  // 27 for what it would take to cover this properly.
  //
  // Covered instead where it can be exercised honestly: tests/unit/data/
  // sets.test.ts mocks fetchAllSets/fetchSetForDetailPage to reject and asserts
  // the wrapper still resolves to the snapshot. Same code path, no dependence
  // on dev's module graph.
});
