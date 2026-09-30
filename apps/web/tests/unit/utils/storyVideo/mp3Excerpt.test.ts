import { describe, expect, it, vi } from "vitest";
import {
  Mp3ExcerptError,
  type Mp3Layout,
  type RangeFetch,
  detectEncoding,
  excerptByteRange,
  fetchExcerpt,
  findFrameSync,
  id3TagEnd,
  parseFrameHeader,
  rangeFetcher,
  readMp3Layout,
} from "~/utils/storyVideo/mp3Excerpt";

// MPEG-1 Layer III, 320kbps, 48kHz, no padding — every catalogue set's frame
// header (the CDN files start their frames with ff fb e4 44 / ff fb e4 64).
const HEADER_320_48 = [0xff, 0xfb, 0xe4, 0x64];
const FRAME_BYTES = 960;

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));

/** One 960-byte frame; `tag` goes at byte 36, where LAME puts Info/Xing. */
function frame(tag?: string, index?: number): Uint8Array {
  const f = new Uint8Array(FRAME_BYTES);
  f.set(HEADER_320_48, 0);
  if (tag) f.set(ascii(tag), 36);
  // Stamp audio frames with their index so a test can see which frame a
  // decoder was handed first.
  if (index !== undefined) new DataView(f.buffer).setUint32(4, index);
  return f;
}

/** ID3v2 header declaring `size` bytes of tag body, followed by that body. */
function id3(size: number): Uint8Array {
  const tag = new Uint8Array(10 + size);
  tag.set([
    0x49,
    0x44,
    0x33,
    4,
    0,
    0,
    (size >> 21) & 0x7f,
    (size >> 14) & 0x7f,
    (size >> 7) & 0x7f,
    size & 0x7f,
  ]);
  return tag;
}

function mp3File({
  tag = "Info",
  id3Size = 34,
  frames = 700,
}: { tag?: string | null; id3Size?: number | null; frames?: number }) {
  const parts: Uint8Array[] = [];
  if (id3Size !== null) parts.push(id3(id3Size));
  if (tag !== null) parts.push(frame(tag));
  for (let i = 0; i < frames; i++) parts.push(frame(undefined, i));
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const fetchFrom =
  (file: Uint8Array): RangeFetch =>
  async (_url, from, to) =>
    file.slice(from, to + 1);

const CDN_LAYOUT: Mp3Layout = {
  // ID3 tag ends at 44 (measured on the CDN copy of set-003-iona-violet),
  // then the 960-byte Info frame.
  audioStart: 1004,
  sampleRate: 48000,
  bitrateKbps: 320,
  bytesPerFrame: 960,
  frameSeconds: 1152 / 48000,
};

describe("parseFrameHeader", () => {
  it("reads 320kbps / 48kHz", () => {
    expect(parseFrameHeader(new Uint8Array(HEADER_320_48), 0)).toEqual({
      bitrateKbps: 320,
      sampleRate: 48000,
      frameBytes: 960,
    });
  });

  it("adds the padding byte, e.g. 128kbps / 44.1kHz", () => {
    expect(parseFrameHeader(new Uint8Array([0xff, 0xfb, 0x90, 0x64]), 0)?.frameBytes).toBe(417);
    expect(parseFrameHeader(new Uint8Array([0xff, 0xfb, 0x92, 0x64]), 0)?.frameBytes).toBe(418);
  });

  it("rejects anything but MPEG-1 Layer III", () => {
    expect(parseFrameHeader(new Uint8Array([0xff, 0xf3, 0xe4, 0x64]), 0)).toBeNull(); // MPEG-2
    expect(parseFrameHeader(new Uint8Array([0xff, 0xfd, 0xe4, 0x64]), 0)).toBeNull(); // Layer II
  });

  it("rejects free-format and reserved bitrate / sample-rate indices", () => {
    expect(parseFrameHeader(new Uint8Array([0xff, 0xfb, 0x04, 0x64]), 0)).toBeNull();
    expect(parseFrameHeader(new Uint8Array([0xff, 0xfb, 0xf4, 0x64]), 0)).toBeNull();
    expect(parseFrameHeader(new Uint8Array([0xff, 0xfb, 0xec, 0x64]), 0)).toBeNull();
  });

  it("rejects a missing sync or truncated bytes", () => {
    expect(parseFrameHeader(new Uint8Array([0xfe, 0xfb, 0xe4, 0x64]), 0)).toBeNull();
    expect(parseFrameHeader(new Uint8Array([0xff, 0xfb]), 0)).toBeNull();
  });
});

describe("id3TagEnd", () => {
  it("is 0 without an ID3 tag, as on the 002 files", () => {
    expect(id3TagEnd(new Uint8Array(HEADER_320_48))).toBe(0);
  });

  it("reads the CDN files' tag: 34 bytes of body → audio at 44", () => {
    expect(id3TagEnd(new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0x22]))).toBe(44);
  });

  it("decodes the size as syncsafe, 7 bits per byte", () => {
    expect(id3TagEnd(new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 2, 1]))).toBe(10 + 257);
  });

  it("adds 10 bytes for a flagged footer", () => {
    expect(id3TagEnd(new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0x10, 0, 0, 0, 0x22]))).toBe(54);
  });
});

describe("detectEncoding", () => {
  it("reads LAME's Info tag as CBR", () => expect(detectEncoding(frame("Info"))).toBe("cbr"));
  it("reads Xing and VBRI as VBR", () => {
    expect(detectEncoding(frame("Xing"))).toBe("vbr");
    expect(detectEncoding(frame("VBRI"))).toBe("vbr");
  });
  it("is unknown without a tag", () => expect(detectEncoding(frame())).toBe("unknown"));
});

describe("readMp3Layout", () => {
  it("starts the audio after the tag frame", () => {
    expect(readMp3Layout(44, frame("Info"))).toEqual({ encoding: "cbr", layout: CDN_LAYOUT });
  });

  it("starts the audio at the first frame when there's no tag frame", () => {
    expect(readMp3Layout(0, frame())?.layout.audioStart).toBe(0);
  });

  it("is null when no frame starts there", () => {
    expect(readMp3Layout(0, new Uint8Array(2048))).toBeNull();
  });
});

describe("excerptByteRange", () => {
  // Both ranges are what the spike fetched from the real CDN file.
  it("matches the real 5s fetch at 30:00", () => {
    const range = excerptByteRange(CDN_LAYOUT, 1800, 5);
    expect(range).toMatchObject({ from: 71999084, to: 72207660 });
    expect(range.offsetSeconds).toBeCloseTo(0.048, 9);
  });

  it("matches the real 20s fetch at 30:00", () => {
    expect(excerptByteRange(CDN_LAYOUT, 1800, 20)).toMatchObject({ from: 71999084, to: 72807660 });
  });

  it("puts sub-frame starts into the offset", () => {
    const { offsetSeconds } = excerptByteRange(CDN_LAYOUT, 1800.01, 20);
    expect(offsetSeconds).toBeCloseTo(0.058, 9);
  });

  it("has no preroll at the very start of the set", () => {
    expect(excerptByteRange(CDN_LAYOUT, 0, 20)).toMatchObject({ from: 1004, offsetSeconds: 0 });
  });
});

describe("findFrameSync", () => {
  const like = { sampleRate: 48000, bitrateKbps: 320 };

  it("finds the first frame followed by another", () => {
    const bytes = new Uint8Array(3 + 2 * FRAME_BYTES);
    bytes.set(frame(), 3);
    bytes.set(frame(), 3 + FRAME_BYTES);
    expect(findFrameSync(bytes, like)).toBe(3);
  });

  it("skips a lone header-like pair inside audio data", () => {
    const bytes = new Uint8Array(10 + 2 * FRAME_BYTES);
    bytes.set(HEADER_320_48, 0); // no frame follows 960 bytes later
    bytes.set(frame(), 10);
    bytes.set(frame(), 10 + FRAME_BYTES);
    expect(findFrameSync(bytes, like)).toBe(10);
  });

  it("skips frames of another bitrate", () => {
    const bytes = new Uint8Array(2 * FRAME_BYTES);
    bytes.set(frame(), 0);
    bytes.set(frame(), FRAME_BYTES);
    expect(findFrameSync(bytes, { sampleRate: 48000, bitrateKbps: 256 })).toBe(-1);
  });
});

describe("rangeFetcher", () => {
  const response = (status: number, bytes = new Uint8Array([1, 2, 3])) => {
    const cancel = vi.fn(async () => {});
    const res = {
      status,
      ok: status >= 200 && status < 300,
      body: { cancel },
      arrayBuffer: async () => bytes.buffer,
    } as unknown as Response;
    return { res, cancel };
  };

  it("sends an inclusive Range header and returns the bytes of a 206", async () => {
    const { res } = response(206);
    const fetchFn = vi.fn(async () => res);
    const bytes = await rangeFetcher(fetchFn as unknown as typeof fetch)(
      "https://cdn/x.mp3",
      10,
      19,
    );
    expect(fetchFn).toHaveBeenCalledWith("https://cdn/x.mp3", {
      headers: { Range: "bytes=10-19" },
    });
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
  });

  it("refuses a 200 and cancels its body unread — it would be the whole set", async () => {
    const { res, cancel } = response(200);
    const fetch200 = rangeFetcher((async () => res) as unknown as typeof fetch);
    await expect(fetch200("u", 0, 9)).rejects.toMatchObject({ failure: "no-range-support" });
    expect(cancel).toHaveBeenCalled();
  });

  it("reports HTTP errors", async () => {
    const { res } = response(404);
    await expect(
      rangeFetcher((async () => res) as unknown as typeof fetch)("u", 0, 9),
    ).rejects.toMatchObject({
      failure: "http",
    });
  });
});

describe("fetchExcerpt", () => {
  const decodeFirstFrameIndex = async (data: ArrayBuffer) => {
    const view = new DataView(data);
    expect(view.getUint16(0)).toBe(0xfffb); // handed from a frame boundary
    return view.getUint32(4);
  };

  it("hands the decoder the bytes from two frames before the start", async () => {
    const file = mp3File({});
    const excerpt = await fetchExcerpt("u", 10, 1, decodeFirstFrameIndex, fetchFrom(file));
    expect(excerpt.audio).toBe(Math.floor(10 / 0.024) - 2);
    expect(excerpt.offsetSeconds).toBeCloseTo(0.048 + (10 - 416 * 0.024), 9);
    expect(excerpt.durationSeconds).toBe(1);
  });

  it("handles a file with no ID3 tag", async () => {
    const excerpt = await fetchExcerpt(
      "u",
      1,
      1,
      decodeFirstFrameIndex,
      fetchFrom(mp3File({ id3Size: null })),
    );
    expect(excerpt.audio).toBe(Math.floor(1 / 0.024) - 2);
  });

  it("refuses VBR", async () => {
    const decode = vi.fn();
    await expect(
      fetchExcerpt("u", 1, 1, decode, fetchFrom(mp3File({ tag: "Xing" }))),
    ).rejects.toMatchObject({
      failure: "not-cbr",
    });
    expect(decode).not.toHaveBeenCalled();
  });

  it("refuses a file with no bitrate tag rather than guess", async () => {
    await expect(
      fetchExcerpt("u", 1, 1, vi.fn(), fetchFrom(mp3File({ tag: null }))),
    ).rejects.toBeInstanceOf(Mp3ExcerptError);
  });

  it("passes the signal to every request, and skips the decode once aborted", async () => {
    const file = mp3File({});
    const abort = new AbortController();
    const signals: (AbortSignal | undefined)[] = [];
    const fetchRange: RangeFetch = async (_url, from, to, signal) => {
      signals.push(signal);
      // Aborted while the excerpt itself is downloading.
      if (signals.length === 3) abort.abort();
      return file.slice(from, to + 1);
    };
    const decode = vi.fn();
    await expect(fetchExcerpt("u", 10, 1, decode, fetchRange, abort.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(signals).toEqual([abort.signal, abort.signal, abort.signal]);
    expect(decode).not.toHaveBeenCalled();
  });

  it("refuses something that isn't an MP3", async () => {
    await expect(
      fetchExcerpt("u", 1, 1, vi.fn(), fetchFrom(new Uint8Array(4096))),
    ).rejects.toMatchObject({
      failure: "not-mp3",
    });
  });
});
