import { expect, test } from "@playwright/test";
import { getEvent } from "~/data/events";
import { gotoAndHydrate } from "./_helpers";

test.describe("events page", () => {
  test("renders the sequence_log section", async ({ page }) => {
    await gotoAndHydrate(page, "/events");
    await expect(page.getByText(/sequence_log/i)).toBeVisible();
  });

  test("clicking a card opens the event detail page", async ({ page }) => {
    await gotoAndHydrate(page, "/events");
    const firstEventCard = page.locator("ul li").first().getByRole("button").first();
    await firstEventCard.click();
    await expect(page).toHaveURL(/\/events\/.+/);
    await expect(page.getByRole("link", { name: /events_archive/i })).toBeVisible();
  });

  test("event detail page shows lineup with DJ links", async ({ page }) => {
    await gotoAndHydrate(page, "/events");
    // Click the first event in the sequence_log (past events) — upcoming
    // events may have an unconfirmed lineup and only render a placeholder.
    await page
      .locator('section:has-text("sequence_log") ul li')
      .first()
      .getByRole("button")
      .first()
      .click();
    await expect(page.getByRole("heading", { name: /lineup/i })).toBeVisible();
    const djLink = page.locator('a[href^="/djs/"]').first();
    await expect(djLink).toBeVisible();
  });

  test("co-organized event explains why some lineup names have no DJ profile link", async ({
    page,
  }) => {
    // Asserts against the LIVE description text from events.ts rather than
    // hardcoded wording — that field is editorial copy, changed freely; this
    // test verifies the WIRING (whatever is written there actually renders),
    // not a specific choice of words — this has broken CI before, when draft
    // copy a test was written against got rewritten.
    const event = getEvent("seafield-sound");
    if (!event?.description) throw new Error("seafield-sound event or its description is missing");

    // Direct navigation to a dynamic detail route isn't an established
    // pattern in this suite (every other detail-page test clicks through
    // from the list) — click-through, matching that precedent.
    await gotoAndHydrate(page, "/events");
    await page.getByRole("button", { name: /seafield sound/i }).click();
    await expect(page.getByRole("heading", { name: /lineup/i })).toBeVisible();
    // Confirms the fields wired this session actually render together: real
    // DJ links for the acts that have profiles...
    await expect(page.getByRole("link", { name: /julz lever/i })).toBeVisible();
    // ...and the description explaining the co-organized/partial-lineup case
    // for the ones that don't (rushford / dimebag / 3sr have no djs.ts entry).
    await expect(page.getByText(event.description)).toBeVisible();
  });
});
