import { rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import { processUploadedSet } from "../../../scripts/optimize-images";

// Admin set-upload feature, PR5. Honest scope note (this was explicitly
// asked for in review, not an afterthought): with zero uploaded sets in the
// `sets` table today, the REAL path — a genuine R2 artworkOriginalUrl,
// fetched over a real network, through a real deploy, with Image.tsx
// actually picking up the generated variant instead of its fallback — is
// unexercisable until a real upload happens. What IS meaningfully testable,
// and covered here: `fetch` is mocked (no real network dependency in CI),
// but sharp itself is REAL — these tests exercise the actual resize/encode/
// write pipeline against a synthetic in-memory image, not a re-implemented
// stand-in for it. Confirmed manually beforehand (serving a real repo image
// over a local HTTP server, fetching it for real) that the exact mechanism
// these tests exercise does work end-to-end; that manual check isn't
// something CI can re-run, which is exactly why it's also on the on-device
// checklist in PWA_PROGRESS.md's PR5 entry.

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const UPLOADED_OUT = join(ROOT, "public/images/uploads");

async function makeTestPng(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .png()
    .toBuffer();
}

describe("processUploadedSet", () => {
  afterEach(async () => {
    vi.unstubAllGlobals();
    await rm(UPLOADED_OUT, { recursive: true, force: true });
  });

  it("fetches the artwork and writes real AVIF/WebP variants to public/images/uploads/{id}-{w}.{ext}", async () => {
    const buffer = await makeTestPng(1200, 1200);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(buffer, { status: 200 })));

    const result = await processUploadedSet({
      id: "test-set-1",
      artworkOriginalUrl: "https://cdn.formatglasgow.com/sets/test-set-1/artwork.png",
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    expect(result.wroteAny).toBe(true);
    expect(result.variants).toHaveLength(4); // 640/1080 × avif/webp

    const outStat = await stat(join(UPLOADED_OUT, "test-set-1-640.avif"));
    expect(outStat.size).toBeGreaterThan(0);
  });

  it("never writes into public/images/sets/ — that directory is legacy sets' committed output", async () => {
    const buffer = await makeTestPng(200, 200);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(buffer, { status: 200 })));

    await processUploadedSet({
      id: "test-set-1",
      artworkOriginalUrl: "https://cdn.example.com/x.png",
    });

    await expect(stat(join(ROOT, "public/images/sets/test-set-1-640.avif"))).rejects.toThrow();
  });

  it("skips regenerating variants that already exist (existence-only — no local source mtime to compare)", async () => {
    const buffer = await makeTestPng(200, 200);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(buffer, { status: 200 })));

    const first = await processUploadedSet({
      id: "test-set-2",
      artworkOriginalUrl: "https://cdn.example.com/x.png",
    });
    expect(first.status === "ok" && first.wroteAny).toBe(true);

    const second = await processUploadedSet({
      id: "test-set-2",
      artworkOriginalUrl: "https://cdn.example.com/x.png",
    });
    expect(second.status === "ok" && second.wroteAny).toBe(false);
  });

  // Failure policy (review item 3): a missing/broken variant degrades to
  // Image.tsx's already-shipped fallback — this must warn and skip, never
  // throw and fail the whole build.
  it("returns a failed outcome with a reason, doesn't throw, when the fetch resolves non-ok (a 404'd artworkOriginalUrl)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));

    const result = await processUploadedSet({
      id: "test-set-3",
      artworkOriginalUrl: "https://cdn.example.com/missing.png",
    });

    expect(result.status).toBe("failed");
    if (result.status !== "failed") throw new Error("expected failed");
    expect(result.reason).toContain("404");
  });

  it("returns a failed outcome, doesn't throw, when the fetch call itself rejects (R2 unreachable)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const result = await processUploadedSet({
      id: "test-set-4",
      artworkOriginalUrl: "https://cdn.example.com/x.png",
    });

    expect(result.status).toBe("failed");
  });

  it("skips a set with no artworkOriginalUrl at all (the legacy-set shape) without ever fetching", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await processUploadedSet({ id: "set-002-til" });

    expect(result).toEqual({
      id: "set-002-til",
      status: "failed",
      reason: "no artworkOriginalUrl",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not upscale a source narrower than the largest requested width", async () => {
    const smallBuffer = await makeTestPng(50, 50);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(smallBuffer, { status: 200 })));

    const result = await processUploadedSet({
      id: "test-set-small",
      artworkOriginalUrl: "https://cdn.example.com/small.png",
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") throw new Error("expected ok");
    // Both target widths (640, 1080) cap to the 50px source and dedupe to
    // one — 1 width × 2 formats = 2 variants, not 4.
    expect(result.variants).toHaveLength(2);
  });
});
