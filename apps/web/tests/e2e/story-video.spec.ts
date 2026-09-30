import { expect, test } from "@playwright/test";
import type { pickStoryMimeType } from "../../app/utils/storyVideo/capability";
import type { StoryRecordingDiagnostics, recordStory } from "../../app/utils/storyVideo/recorder";
import type {
  StoryFrameInput,
  loadStoryAssets,
  prepareStoryFrame,
} from "../../app/utils/storyVideo/renderer";

// The Story video modules in a real browser, before any UI reaches them.
// `page.route` answers a harness URL on the dev server's origin inside this
// test only, and the page imports the real modules from Vite by path. The
// app gains no route. The audio, peaks and artwork are synthesised in the
// page, so nothing here touches the network.

const HARNESS = "/__story-harness";

type Outcome =
  | {
      ok: true;
      diagnostics: StoryRecordingDiagnostics;
      fileType: string;
      width: number;
      height: number;
      duration: number;
    }
  | { ok: false; unsupported: boolean; error: string };

test.describe("story video recording", () => {
  test.beforeEach(async ({ page }) => {
    await page.route(`**${HARNESS}`, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><html><body><button id="record">record</button><canvas id="out"></canvas></body></html>`,
      }),
    );
  });

  test("records a short excerpt to a 1080×1920 H.264 + AAC MP4", async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== "chromium",
      "MediaRecorder MP4 is exercised on desktop Chromium only",
    );
    // CI's Linux Chromium has no H.264 / AAC encoders, so it can never pass
    // there. ci.yml's `e2e-story-video` job runs this test on macOS instead.
    // Don't remove that job without replacing it.
    test.skip(
      !!process.env.CI && process.platform === "linux",
      "runs in ci.yml's e2e-story-video job on macOS",
    );
    test.setTimeout(60_000);
    await page.goto(HARNESS);

    await page.evaluate(() => {
      // Built with Function so the test runner's transpiler can't rewrite this
      // browser-side import() into a Node require().
      const importModule = new Function("path", "return import(path)") as (
        path: string,
      ) => Promise<Record<string, never>>;
      const run = async (): Promise<Outcome> => {
        const capability = (await importModule(
          "/app/utils/storyVideo/capability.ts",
        )) as unknown as { pickStoryMimeType: typeof pickStoryMimeType };
        const recorder = (await importModule("/app/utils/storyVideo/recorder.ts")) as unknown as {
          recordStory: typeof recordStory;
        };
        const renderer = (await importModule("/app/utils/storyVideo/renderer.ts")) as unknown as {
          loadStoryAssets: typeof loadStoryAssets;
          prepareStoryFrame: typeof prepareStoryFrame;
        };
        if (!capability.pickStoryMimeType())
          return { ok: false, unsupported: true, error: "no H.264 + AAC MP4 recording" };

        const context = new AudioContext();
        // 3s of a 220Hz tone; the recorder plays 2s of it from 0.5s in.
        const audio = context.createBuffer(2, context.sampleRate * 3, context.sampleRate);
        for (let c = 0; c < 2; c++) {
          const data = audio.getChannelData(c);
          for (let i = 0; i < data.length; i++)
            data[i] = 0.3 * Math.sin((2 * Math.PI * 220 * i) / context.sampleRate);
        }
        const art = document.createElement("canvas");
        art.width = art.height = 64;
        const ag = art.getContext("2d");
        if (ag) {
          ag.fillStyle = "#43437a";
          ag.fillRect(0, 0, 64, 64);
        }
        const assets = await renderer.loadStoryAssets([art.toDataURL("image/png")]);
        const excerpt = { audio, offsetSeconds: 0.5, durationSeconds: 2 };
        const input: StoryFrameInput = {
          djName: "Test DJ",
          title: "Form:at 000",
          date: "2026-01-01",
          startSeconds: 600,
          setSeconds: 5400,
          excerpt,
          setPeaks: Array.from({ length: 1000 }, (_, i) => 0.3 + 0.2 * Math.sin(i / 20)),
          artwork: assets.artwork,
        };
        const canvas = document.getElementById("out") as HTMLCanvasElement;
        const { file, diagnostics } = await recorder.recordStory({
          context,
          canvas,
          frame: renderer.prepareStoryFrame(input),
          excerpt,
          fileName: "story.mp4",
        });
        await context.close();

        const video = document.createElement("video");
        video.muted = true;
        const loaded = new Promise<void>((resolve, reject) => {
          video.onloadedmetadata = () => resolve();
          video.onerror = () => reject(new Error(`video error ${video.error?.code}`));
        });
        video.src = URL.createObjectURL(file);
        await loaded;
        return {
          ok: true,
          diagnostics,
          fileType: file.type,
          width: video.videoWidth,
          height: video.videoHeight,
          duration: video.duration,
        };
      };
      // Started from a click so the AudioContext gets a user activation.
      document.getElementById("record")?.addEventListener("click", () => {
        run().then(
          (outcome) => Object.assign(window, { __outcome: outcome }),
          (e: unknown) =>
            Object.assign(window, {
              __outcome: { ok: false, unsupported: false, error: String(e) },
            }),
        );
      });
    });

    await page.click("#record");
    const outcome = (await page
      .waitForFunction(() => (window as { __outcome?: unknown }).__outcome, null, {
        timeout: 45_000,
      })
      .then((h) => h.jsonValue())) as Outcome;

    // Playwright's Chromium builds don't all ship proprietary encoders. Locally
    // that's the feature's "not available here" case, so the test skips. In
    // CI it fails instead: a skip there would leave this test guarding
    // nothing on every run, and nobody reads skip counts.
    const unsupported = !outcome.ok && outcome.unsupported;
    if (unsupported && process.env.CI) {
      throw new Error(
        "CI's Chromium can't record H.264 + AAC MP4, so this test can't check anything here. " +
          "Run it in a browser that can (e.g. Playwright's `chrome` channel) or remove it deliberately; don't let it skip.",
      );
    }
    test.skip(unsupported, "this Chromium build can't record H.264 + AAC MP4");
    if (!outcome.ok) throw new Error(outcome.error);

    expect(outcome.fileType).toBe("video/mp4");
    expect(outcome.diagnostics.mimeType).toMatch(/^video\/mp4/);
    expect(outcome.diagnostics.boxes).toMatch(/^ftyp, moov/);
    expect([outcome.width, outcome.height]).toEqual([1080, 1920]);
    expect(Number.isFinite(outcome.duration)).toBe(true);
    expect(outcome.duration).toBeGreaterThan(1.5);
    expect(outcome.diagnostics.framesDrawn).toBeGreaterThan(10);
  });
});
