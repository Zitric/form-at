import { readFileSync } from "node:fs";
import { encodeFinePeaks } from "@form-at/data/finePeaks";
import { type Page, type Route, devices, expect, test } from "@playwright/test";
import { movieDurationSeconds, topLevelBoxes } from "../../app/utils/storyVideo/mp4Boxes";
import { gotoAndHydrate } from "./_helpers";

// The Instagram Story entry and excerpt picker on a phone: launched on
// Android, behind `?story=on` everywhere else. Runs in the `chromium` project
// with Pixel 7 emulation rather than in `mobile-chrome`, because CI only runs
// the chromium and webkit projects.
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

// The set's fine peaks: one value per 0.1s over the whole set, all between
// 0.6 and 0.9, so every bar the zoomed strip draws from them is at least
// two-thirds of the tallest in view. The synthetic MP3 is silent, so a strip
// drawn from the decoded slice instead is 2px bars throughout.
const FINE_PEAKS = Buffer.from(
  encodeFinePeaks(
    Array.from({ length: 8451 * 10 }, (_, i) => 0.6 + 0.3 * Math.abs(Math.sin(i / 13))),
  ),
);

async function stubNetworkAndCodecs(page: Page) {
  await page.route(/cdn\.formatglasgow\.com\/.*\.mp3(\?.*)?$/, serveMp3);
  await page.route(/cdn\.formatglasgow\.com\/.*peaks-fine\.bin(\?.*)?$/, (route) =>
    route.fulfill({ headers: cors, contentType: "application/octet-stream", body: FINE_PEAKS }),
  );
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

test.describe("instagram story entry (Android phone)", () => {
  // Playwright needs the fixtures argument destructured; `page` is the one
  // every test here uses anyway.
  test.beforeEach(async ({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "phone emulation runs in the chromium project");
  });

  // Launched on Android (STORY_LAUNCHED_ON_ANDROID): no flag needed.
  test("is there without the flag", async ({ page }) => {
    await stubNetworkAndCodecs(page);
    await openShare(page, SET_PATH);
    await expect(page.getByRole("button", { name: /instagram_story/ })).toBeVisible();
  });

  // A phone that can't record H.264 + AAC MP4 gets no entry, rather than
  // one that fails at the end. Without the codec stub, isTypeSupported
  // answers for real, so it's forced to no here.
  test("isn't there where MP4 can't be recorded", async ({ page }) => {
    await stubNetworkAndCodecs(page);
    await page.addInitScript(() => {
      if ("MediaRecorder" in window) MediaRecorder.isTypeSupported = () => false;
    });
    await openShare(page, SET_PATH);
    await expect(page.getByRole("button", { name: /instagram_story/ })).toHaveCount(0);
    await expect(page.getByText("create_video:")).toHaveCount(0);
  });

  test("in a browser tab, opens the install gate", async ({ page }) => {
    await stubNetworkAndCodecs(page);
    await openShare(page, SET_PATH);
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

    const picker = page.getByRole("dialog", { name: "Pick 15 seconds for an Instagram story" });
    await expect(picker).toBeVisible();
    // A third of 8451s is 2817s: 46:57.
    await expect(pickerLabel(page)).toHaveText("46:57 → 47:12");
    await expect(picker.getByText("drag the waveform, tap the full set, or nudge")).toBeVisible();

    // Dragging the waveform right goes back in time.
    const strip = picker.getByRole("slider", { name: "15-second excerpt start" });
    const box = await strip.boundingBox();
    if (!box) throw new Error("zoomed strip has no box");
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(pickerLabel(page)).not.toHaveText("46:57 → 47:12");
    await expect(picker.getByText("drag the waveform, tap the full set, or nudge")).toBeVisible();

    await picker.getByRole("button", { name: "Forward 5 seconds" }).click();

    // Tapping the far end of the full-set strip lands the window at the end.
    const full = picker.getByRole("button", { name: "Jump to a point in the set" });
    const fullBox = await full.boundingBox();
    if (!fullBox) throw new Error("full strip has no box");
    await page.mouse.click(fullBox.x + fullBox.width - 1, fullBox.y + fullBox.height / 2);
    // 8451s − 15 = 8436s: 140:36.
    await expect(pickerLabel(page)).toHaveText("140:36 → 140:51");
    await expect(picker.getByText("drag the waveform, tap the full set, or nudge")).toBeVisible();
  });
});

// ── The zoomed strip while dragging: fine peaks vs the decoded slice ─────
// With the set's peaks-fine.bin the strip draws from it, so a drag needs no
// audio: every MP3 request is refused while the pointer is down, and the
// strip must still be whole, including past the start of the slice decoded
// before the drag. The control runs the same drag with the file 404ing: the
// strip falls back to the decoded slice, which is silent here (2px bars) and
// undecoded past its start (2px dotted line), so the same measurement reads
// near zero — the first test can only pass on fine peaks.

// The share of 4px bar slots, across the left 30% of the zoomed strip, whose
// bar is taller than a quarter of the canvas. Read from the canvas pixels.
async function tallBarShare(page: Page): Promise<number> {
  return page
    .getByRole("slider", { name: "15-second excerpt start" })
    .locator("canvas")
    .evaluate((canvas: HTMLCanvasElement) => {
      const g = canvas.getContext("2d");
      if (!g) return 0;
      const { width, height } = canvas;
      const { data } = g.getImageData(0, 0, width, height);
      const slot = Math.round(4 * (width / canvas.clientWidth));
      const slots = Math.floor((width * 0.3) / slot);
      let tall = 0;
      for (let s = 0; s < slots; s++) {
        let painted = 0;
        for (let x = s * slot; x < (s + 1) * slot; x++) {
          let rows = 0;
          for (let y = 0; y < height; y++) if ((data[(y * width + x) * 4 + 3] ?? 0) > 0) rows++;
          painted = Math.max(painted, rows);
        }
        if (painted > height / 4) tall++;
      }
      return slots ? tall / slots : 0;
    });
}

async function openPickerAndDragBackWithMp3Blocked(page: Page) {
  let blockMp3 = false;
  let blockedRequests = 0;
  await page.route(/cdn\.formatglasgow\.com\/.*\.mp3(\?.*)?$/, (route) => {
    if (!blockMp3) return serveMp3(route);
    blockedRequests++;
    return route.abort();
  });
  await emulateStandalone(page);
  await openShare(page, `${SET_PATH}?story=on`);
  await page.getByRole("button", { name: /instagram_story/ }).click();
  const picker = page.getByRole("dialog", { name: "Pick 15 seconds for an Instagram story" });
  // The first slice decodes, so preview is available before the drag.
  await expect(picker.getByText("drag the waveform, tap the full set, or nudge")).toBeVisible();
  await expect(picker.getByRole("button", { name: /preview/ })).toBeEnabled();

  const strip = picker.getByRole("slider", { name: "15-second excerpt start" });
  const box = await strip.boundingBox();
  if (!box) throw new Error("zoomed strip has no box");
  blockMp3 = true;
  // Nearly the strip's whole width: ~40s back, past the start of the 90s
  // slice decoded around the opening window (its view starts 22.5s in).
  await page.mouse.move(box.x + box.width * 0.04, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.96, box.y + box.height / 2, { steps: 12 });
  // Held past the 250ms slice debounce, so a slice fetch would have started.
  await page.waitForTimeout(600);
  return {
    picker,
    blockedRequests: () => blockedRequests,
    release: async () => {
      blockMp3 = false;
      await page.mouse.up();
    },
  };
}

test.describe("the zoomed strip while dragging (mobile, installed app)", () => {
  test.beforeEach(async ({ page: _page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "phone emulation runs in the chromium project");
  });

  test("draws from fine peaks: whole while the MP3 is unreachable, and fetches no audio mid-drag", async ({
    page,
  }) => {
    await stubNetworkAndCodecs(page);
    const drag = await openPickerAndDragBackWithMp3Blocked(page);

    expect(drag.blockedRequests()).toBe(0);
    expect(await tallBarShare(page)).toBeGreaterThan(0.9);
    await expect(drag.picker.getByText("loading this part of the set…")).toHaveCount(0);
    // Preview waits for the slice under the new window.
    await expect(drag.picker.getByRole("button", { name: /preview/ })).toBeDisabled();

    // Released, the slice for preview and recording loads.
    await drag.release();
    await expect(drag.picker.getByRole("button", { name: /preview/ })).toBeEnabled();
    expect(await tallBarShare(page)).toBeGreaterThan(0.9);
  });

  test("control — without fine peaks, the same drag shows undecoded audio", async ({ page }) => {
    await stubNetworkAndCodecs(page);
    await page.route(/cdn\.formatglasgow\.com\/.*peaks-fine\.bin(\?.*)?$/, (route) =>
      route.fulfill({ status: 404, headers: cors }),
    );
    const drag = await openPickerAndDragBackWithMp3Blocked(page);

    expect(await tallBarShare(page)).toBeLessThan(0.1);
    await drag.release();
  });
});

// ── Create → record → share, in the installed app ────────────────────────
// The share sheet can't be driven from a test, so navigator.share/canShare
// are stubbed everywhere. The recording is real where the browser has H.264 +
// AAC encoders (ci.yml's macOS `e2e-story-video` job, and local Macs), and
// checked for size and duration there. CI's Linux Chromium has neither
// encoder, so there MediaRecorder is replaced by a fake that hands back a real
// Chrome recording (the unit tests' fragmented fixture): the flow, the remux,
// the screens and the events are still real. Either way the recording takes
// the real EXCERPT_SECONDS.
// STORY_FAKE_RECORDER=1 runs the Linux path on any machine.
const fakeRecorder = process.platform === "linux" || !!process.env.STORY_FAKE_RECORDER;
const FRAGMENTED_FIXTURE = readFileSync(
  new URL("../fixtures/mediarecorder-fragmented.mp4", import.meta.url),
).toString("base64");
// ffprobe on that fixture.
const FIXTURE_SECONDS = 6.7566;

async function stubShareAndRecorder(page: Page) {
  await page.addInitScript(
    ({ fake, fixture }: { fake: boolean; fixture: string }) => {
      const w = window as unknown as {
        __events: string[];
        __shared: File[];
        MediaRecorder: unknown;
      };
      w.__events = [];
      w.__shared = [];
      const beacon = navigator.sendBeacon.bind(navigator);
      navigator.sendBeacon = (url, data) => {
        if (String(url).includes("/api/event") && data instanceof Blob) {
          void data.text().then((t) => w.__events.push(JSON.parse(t).event_type));
        }
        return beacon(url, data);
      };
      navigator.canShare = () => true;
      navigator.share = async (data) => {
        w.__shared.push(...(data?.files ?? []));
      };
      if (!fake) return;
      class FakeMediaRecorder {
        static isTypeSupported = (type: string) => type.startsWith("video/mp4");
        mimeType: string;
        state = "inactive";
        ondataavailable: ((e: { data: Blob }) => void) | null = null;
        onstop: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor(_stream: MediaStream, options?: { mimeType?: string }) {
          this.mimeType = options?.mimeType ?? "video/mp4";
        }
        start() {
          this.state = "recording";
        }
        stop() {
          this.state = "inactive";
          // A genuine fragmented recording, so the remux has real work to do.
          const bytes = Uint8Array.from(atob(fixture), (c) => c.charCodeAt(0));
          const data = new Blob([bytes], { type: this.mimeType });
          setTimeout(() => {
            this.ondataavailable?.({ data });
            this.onstop?.();
          }, 0);
        }
      }
      w.MediaRecorder = FakeMediaRecorder;
    },
    { fake: fakeRecorder, fixture: FRAGMENTED_FIXTURE },
  );
  // The story frame's artwork. In the dev server the optimised /images/
  // variant doesn't exist, so the renderer falls back to the CDN original.
  await page.route(/cdn\.formatglasgow\.com\/.*artwork\.png/, (route) =>
    route.fulfill({
      headers: cors,
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
        "base64",
      ),
    }),
  );
}

test("creates a story in the installed app and hands a non-fragmented MP4 to the share sheet", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "phone emulation runs in the chromium project");
  test.setTimeout(90_000);
  await stubNetworkAndCodecs(page);
  await stubShareAndRecorder(page);
  await emulateStandalone(page);
  await openShare(page, `${SET_PATH}?story=on`);
  await page.getByRole("button", { name: /instagram_story/ }).click();

  const flow = page.getByRole("dialog", { name: "Pick 15 seconds for an Instagram story" });
  const create = flow.getByRole("button", { name: /create_story/ });
  await expect(create).toBeEnabled({ timeout: 15_000 });
  await create.click();

  await expect(flow.getByText(/recording… \d+s \/ 15s/)).toBeVisible();
  await expect(flow.getByText("keep the screen on")).toBeVisible();
  await expect(flow.getByText("your story is ready")).toBeVisible({ timeout: 40_000 });

  if (!fakeRecorder) {
    // A real recording: the preview <video> reads the file's own metadata.
    const video = flow.getByLabel("Your story video");
    await expect
      .poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 10_000 })
      .toBeGreaterThanOrEqual(1);
    const meta = await video.evaluate((v: HTMLVideoElement) => [
      v.videoWidth,
      v.videoHeight,
      v.duration,
    ]);
    expect(meta.slice(0, 2)).toEqual([1080, 1920]);
    expect(meta[2]).toBeGreaterThan(14);
    expect(meta[2]).toBeLessThan(16.5);
  }

  await flow.getByRole("button", { name: "share", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("shared — add the link sticker in instagram")).toBeVisible();

  const shared = await page.evaluate(() =>
    (window as unknown as { __shared: File[] }).__shared.map((f) => [f.name, f.type]),
  );
  expect(shared).toEqual([["formatglasgow-set-003-unreal-46-57.mp4", "video/mp4"]]);

  // The file Instagram gets: one moov before the media, no fragments, and an
  // mvhd that declares the whole length. MediaRecorder's own output fails all
  // three, which is what truncated stories on the phone.
  const sharedBytes = new Uint8Array(
    await page.evaluate(async () =>
      Array.from(
        new Uint8Array(await (window as unknown as { __shared: File[] }).__shared[0].arrayBuffer()),
      ),
    ),
  );
  expect(topLevelBoxes(sharedBytes).boxes.map((b) => b.type)).toEqual(["ftyp", "moov", "mdat"]);
  const declared = movieDurationSeconds(sharedBytes) ?? 0;
  if (fakeRecorder) {
    expect(declared).toBeCloseTo(FIXTURE_SECONDS, 2);
  } else {
    expect(declared).toBeGreaterThan(14);
    expect(declared).toBeLessThan(16.5);
  }
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __events: string[] }).__events))
    .toEqual(expect.arrayContaining(["story_video_created", "story_video_shared"]));
  const events = await page.evaluate(() => (window as unknown as { __events: string[] }).__events);
  expect(events.filter((e) => e.startsWith("story_video_"))).toEqual([
    "story_video_created",
    "story_video_shared",
  ]);
});

// The link the picker copies for Instagram's link sticker carries ref=story:
// the set page counts the arrival once and drops ref, keeping the timestamp.
test("a story link is counted once, and its ref dropped from the address", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "chromium project only");
  // Beacons don't reliably show up as page requests, so record them as the
  // page sends them; a reload starts a fresh list.
  await page.addInitScript(() => {
    const w = window as unknown as { __events: string[] };
    w.__events = [];
    const beacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url, data) => {
      if (String(url).includes("/api/event") && data instanceof Blob) {
        void data.text().then((t) => w.__events.push(t));
      }
      return beacon(url, data);
    };
  });
  const linkOpens = () =>
    page.evaluate(() =>
      (window as unknown as { __events: string[] }).__events.filter((e) =>
        e.includes("story_link_open"),
      ),
    );
  await gotoAndHydrate(page, `${SET_PATH}?t=60&ref=story`);
  await expect(page).toHaveURL(/\/sets\/set-003-unreal\?t=60$/);
  await expect(page.getByRole("button", { name: /play @ 1:00/ })).toBeVisible();
  await expect.poll(async () => (await linkOpens()).length).toBe(1);
  expect((await linkOpens())[0]).toContain(`"set_id":"${SET_ID}"`);
  // A reload of the cleaned address doesn't count again.
  await page.reload();
  await expect(page.getByRole("button", { name: /play @ 1:00/ })).toBeVisible();
  await page.waitForTimeout(500);
  expect(await linkOpens()).toHaveLength(0);
});

// Instagram's in-app browser on Android can't install the app or share a
// file, so the gate sends the visitor out to Chrome through its menu.
test("in Instagram's Android browser, the gate says to open it in Chrome", async ({
  browser,
}, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "chromium project only");
  const { defaultBrowserType: _ignored, ...pixel } = devices["Pixel 7"];
  const context = await browser.newContext({
    ...pixel,
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; SM-S916U Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/119.0.6045.66 Mobile Safari/537.36 Instagram 309.0.0.40.113 Android (34/14; 510dpi; 1080x2113; samsung; SM-S916U; dm2q; qcom; en_US; 536988425)",
  });
  const page = await context.newPage();
  await stubNetworkAndCodecs(page);
  await openShare(page, SET_PATH);
  await page.getByRole("button", { name: /instagram_story/ }).click();
  const gate = page.getByRole("dialog", { name: "Form:at — make an Instagram story" });
  await expect(gate).toContainText("open in Chrome");
  await context.close();
});

// iOS is untested (TECH_DEBT.md item 30), so an iPhone still needs the flag.
test("an iPhone needs the flag", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "chromium project only");
  const { defaultBrowserType: _ignored, ...iphone } = devices["iPhone 14"];
  const context = await browser.newContext(iphone);
  const page = await context.newPage();
  await stubNetworkAndCodecs(page);
  await openShare(page, SET_PATH);
  await expect(page.getByRole("button", { name: /instagram_story/ })).toHaveCount(0);
  await openShare(page, `${SET_PATH}?story=on`);
  await expect(page.getByRole("button", { name: /instagram_story/ })).toBeVisible();
  await context.close();
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
