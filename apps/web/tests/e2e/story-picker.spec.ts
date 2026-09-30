import { type Page, type Route, devices, expect, test } from "@playwright/test";
import { gotoAndHydrate } from "./_helpers";

// The Instagram Story entry and excerpt picker, behind `?story=on`, on a
// phone. Runs in the `chromium` project with Pixel 7 emulation rather than in
// `mobile-chrome`, because CI only runs the chromium and webkit projects.
//
// Two things are emulated, and only these: MediaRecorder claiming H.264 + AAC
// MP4 (CI's Linux Chromium has neither encoder, and the picker records
// nothing), and, for the picker, standalone display-mode. The audio is a
// synthetic CBR MP3 served by Range with 206, so nothing touches the network.

const { defaultBrowserType: _ignored, ...pixel7 } = devices["Pixel 7"];
test.use(pixel7);

const SET_ID = "set-003-unreal";
const SET_PATH = `/sets/${SET_ID}`;
// set-003-unreal in the committed snapshot: 2:20:51 (8451s), 338072684 bytes.
const FILE_BYTES = 338_072_684;

// A 320kbps / 48kHz CBR MP3 like the catalogue's: no ID3 tag (as on the 002
// files), a LAME `Info` frame, then silent 960-byte frames (all-zero side
// info decodes as silence), at whatever offset is asked for.
const FRAME_BYTES = 960;
const HEADER = [0xff, 0xfb, 0xe4, 0x64];
const INFO = [0x49, 0x6e, 0x66, 0x6f];

function mp3Bytes(from: number, to: number): Buffer {
  const out = Buffer.alloc(to - from + 1);
  const firstFrame = Math.floor(from / FRAME_BYTES);
  const lastFrame = Math.floor(to / FRAME_BYTES);
  for (let f = firstFrame; f <= lastFrame; f++) {
    const at = f * FRAME_BYTES - from;
    HEADER.forEach((byte, i) => {
      if (at + i >= 0 && at + i < out.length) out[at + i] = byte;
    });
    if (f === 0) {
      INFO.forEach((byte, i) => {
        out[at + 36 + i] = byte;
      });
    }
  }
  return out;
}

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "range",
  "Access-Control-Expose-Headers": "Content-Range, Accept-Ranges, Content-Length",
};

async function serveMp3(route: Route) {
  const request = route.request();
  if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
  const range = /bytes=(\d+)-(\d+)/.exec(request.headers().range ?? "");
  // The picker must only ever ask for ranges; a plain GET would be the whole set.
  if (!range) return route.fulfill({ status: 400, headers: cors, body: "range required" });
  const from = Number(range[1]);
  const to = Math.min(Number(range[2]), FILE_BYTES - 1);
  return route.fulfill({
    status: 206,
    headers: {
      ...cors,
      "Content-Type": "audio/mpeg",
      "Accept-Ranges": "bytes",
      "Content-Range": `bytes ${from}-${to}/${FILE_BYTES}`,
    },
    body: mp3Bytes(from, to),
  });
}

async function stubNetworkAndCodecs(page: Page) {
  await page.route(/cdn\.formatglasgow\.com\/.*\.mp3(\?.*)?$/, serveMp3);
  await page.route(/cdn\.formatglasgow\.com\/.*peaks\.json(\?.*)?$/, (route) =>
    route.fulfill({
      headers: cors,
      contentType: "application/json",
      body: JSON.stringify({
        peaks: Array.from({ length: 1000 }, (_, i) => 0.4 + 0.3 * Math.sin(i / 17)),
      }),
    }),
  );
  await page.addInitScript(() => {
    if (!("MediaRecorder" in window)) return;
    const native = MediaRecorder.isTypeSupported.bind(MediaRecorder);
    MediaRecorder.isTypeSupported = (type) => type.startsWith("video/mp4") || native(type);
  });
}

async function emulateStandalone(page: Page) {
  await page.addInitScript(() => {
    const native = window.matchMedia.bind(window);
    window.matchMedia = (query: string) =>
      query.includes("display-mode: standalone")
        ? ({
            matches: true,
            media: query,
            onchange: null,
            addListener() {},
            removeListener() {},
            addEventListener() {},
            removeEventListener() {},
            dispatchEvent: () => false,
          } as MediaQueryList)
        : native(query);
  });
}

async function openShare(page: Page, url: string) {
  await gotoAndHydrate(page, url);
  await page
    .getByRole("button", { name: /share_set/ })
    .first()
    .click();
  await expect(page.getByRole("dialog", { name: "Share set" })).toBeVisible();
}

const pickerLabel = (page: Page) => page.locator("div.text-gold.tabular-nums");

test.describe("instagram story entry (mobile, ?story=on)", () => {
  // Playwright needs the fixtures argument destructured; `page` is the one
  // every test here uses anyway.
  test.beforeEach(async ({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "phone emulation runs in the chromium project");
  });

  test("isn't there without the flag", async ({ page }) => {
    await stubNetworkAndCodecs(page);
    await openShare(page, SET_PATH);
    await expect(page.getByRole("button", { name: /instagram_story/ })).toHaveCount(0);
  });

  test("in a browser tab, opens the install gate", async ({ page }) => {
    await stubNetworkAndCodecs(page);
    await openShare(page, `${SET_PATH}?story=on`);
    await page.getByRole("button", { name: /instagram_story/ }).click();
    const gate = page.getByRole("dialog", { name: "Form:at — make an Instagram story" });
    await expect(gate).toBeVisible();
    await expect(gate).toContainText("instagram stories are made in the Form:at app");
    // It replaces the share modal rather than stacking on top of it.
    await expect(page.getByRole("dialog", { name: "Share set" })).toHaveCount(0);
  });

  test("in the installed app, opens the picker a third of the way in", async ({ page }) => {
    await stubNetworkAndCodecs(page);
    await emulateStandalone(page);
    await openShare(page, `${SET_PATH}?story=on`);
    await page.getByRole("button", { name: /instagram_story/ }).click();

    const picker = page.getByRole("dialog", { name: "Pick 20 seconds for an Instagram story" });
    await expect(picker).toBeVisible();
    // A third of 8451s is 2817s: 46:57.
    await expect(pickerLabel(page)).toHaveText("46:57 → 47:17");
    await expect(picker.getByText("drag the waveform, tap the full set, or nudge")).toBeVisible();

    // Dragging the waveform right goes back in time.
    const strip = picker.getByRole("slider", { name: "20-second excerpt start" });
    const box = await strip.boundingBox();
    if (!box) throw new Error("zoomed strip has no box");
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(pickerLabel(page)).not.toHaveText("46:57 → 47:17");
    await expect(picker.getByText("drag the waveform, tap the full set, or nudge")).toBeVisible();

    await picker.getByRole("button", { name: "Forward 5 seconds" }).click();

    // Tapping the far end of the full-set strip lands the window at the end.
    const full = picker.getByRole("button", { name: "Jump to a point in the set" });
    const fullBox = await full.boundingBox();
    if (!fullBox) throw new Error("full strip has no box");
    await page.mouse.click(fullBox.x + fullBox.width - 1, fullBox.y + fullBox.height / 2);
    // 8451s − 20 = 8431s: 140:31.
    await expect(pickerLabel(page)).toHaveText("140:31 → 140:51");
    await expect(picker.getByText("drag the waveform, tap the full set, or nudge")).toBeVisible();
  });
});

test("desktop never shows the entry, even with the flag", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "chromium project only");
  const context = await browser.newContext(devices["Desktop Chrome"]);
  const page = await context.newPage();
  await stubNetworkAndCodecs(page);
  await openShare(page, `${SET_PATH}?story=on`);
  await expect(page.getByRole("button", { name: /instagram_story/ })).toHaveCount(0);
  await context.close();
});
