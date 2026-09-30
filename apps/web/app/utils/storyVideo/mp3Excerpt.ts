// Fetches just the bytes of one passage of a set's MP3, for the Story video,
// so a 20s clip of a 100–220MB set costs ~800KB rather than the whole file.
//
// The passage is located by byte offset, which is exact (to one 24ms frame)
// only for constant-bitrate files: every frame has the same length, so
// frame n starts at audioStart + n × bytesPerFrame. A VBR file breaks that
// arithmetic with an error that grows the deeper into the set you go, so
// anything not positively marked CBR is refused, never approximated —
// the picker promises "starts exactly here".
//
// MPEG-1 Layer III only (every catalogue set is 320kbps / 48kHz CBR with a
// LAME `Info` tag; the four 002 files carry no ID3 tag at all).

const MPEG1_L3_KBPS = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const MPEG1_SAMPLE_RATES = [44100, 48000, 32000, 0];
const SAMPLES_PER_FRAME = 1152;

// Frames fetched ahead of the target. Layer III's bit reservoir lets a frame
// borrow bits from the frames before it, so decoding from the exact target
// frame garbles its start.
const PREROLL_FRAMES = 2;

// Slack past the computed end, and the window searched for a frame sync. The
// largest MPEG-1 Layer III frame is 1441 bytes (320kbps at 32kHz), so the
// first-frame probe below always holds a whole frame.
const SLACK_BYTES = 4096;
const FIRST_FRAME_PROBE_BYTES = 2048;

export interface FrameHeader {
  bitrateKbps: number;
  sampleRate: number;
  /** Bytes in this frame, padding byte included. */
  frameBytes: number;
}

/** Parses an MPEG-1 Layer III frame header at `at`, or null if there isn't one. */
export function parseFrameHeader(bytes: Uint8Array, at: number): FrameHeader | null {
  const b0 = bytes[at];
  const b1 = bytes[at + 1];
  const b2 = bytes[at + 2];
  if (b0 === undefined || b1 === undefined || b2 === undefined) return null;
  if (b0 !== 0xff || (b1 & 0xe0) !== 0xe0) return null;
  const version = (b1 >> 3) & 3;
  const layer = (b1 >> 1) & 3;
  if (version !== 3 || layer !== 1) return null;
  const bitrateKbps = MPEG1_L3_KBPS[b2 >> 4] ?? 0;
  const sampleRate = MPEG1_SAMPLE_RATES[(b2 >> 2) & 3] ?? 0;
  if (!bitrateKbps || !sampleRate) return null;
  const padding = (b2 >> 1) & 1;
  return {
    bitrateKbps,
    sampleRate,
    frameBytes: Math.floor((144 * bitrateKbps * 1000) / sampleRate) + padding,
  };
}

/**
 * Where the audio starts after an ID3v2 tag at the head of the file, from its
 * first 10 bytes; 0 when there's no tag. The size is syncsafe (7 bits per
 * byte), and a footer, when flagged, adds another 10 bytes.
 */
export function id3TagEnd(head: Uint8Array): number {
  if (head[0] !== 0x49 || head[1] !== 0x44 || head[2] !== 0x33) return 0;
  const byte = (i: number) => (head[i] ?? 0) & 0x7f;
  const size = (byte(6) << 21) | (byte(7) << 14) | (byte(8) << 7) | byte(9);
  const hasFooter = ((head[5] ?? 0) & 0x10) !== 0;
  return 10 + size + (hasFooter ? 10 : 0);
}

/**
 * - `cbr`: LAME's `Info` tag in the first frame — constant bitrate.
 * - `vbr`: a `Xing` or `VBRI` tag — variable bitrate.
 * - `unknown`: no tag. Possibly CBR from another encoder, but nothing proves
 *   it, so callers treat it like VBR.
 */
export type Mp3Encoding = "cbr" | "vbr" | "unknown";

export function detectEncoding(firstFrame: Uint8Array): Mp3Encoding {
  let text = "";
  for (const byte of firstFrame) text += String.fromCharCode(byte);
  if (text.includes("Xing") || text.includes("VBRI")) return "vbr";
  if (text.includes("Info")) return "cbr";
  return "unknown";
}

export interface Mp3Layout {
  /** Byte offset of the first audio frame: after the ID3 tag and the tag frame. */
  audioStart: number;
  sampleRate: number;
  bitrateKbps: number;
  /** Mean frame length. Fractional when padding alternates (e.g. 44.1kHz). */
  bytesPerFrame: number;
  frameSeconds: number;
}

/**
 * The file's frame layout, from where its ID3 tag ends and the bytes that
 * follow (at least one whole frame). Null if those bytes don't start with an
 * MPEG-1 Layer III frame.
 */
export function readMp3Layout(
  id3End: number,
  firstFrame: Uint8Array,
): { layout: Mp3Layout; encoding: Mp3Encoding } | null {
  const header = parseFrameHeader(firstFrame, 0);
  if (!header) return null;
  const encoding = detectEncoding(firstFrame.subarray(0, header.frameBytes));
  // The Info/Xing tag lives in a frame of its own, silent, ahead of the audio.
  const audioStart = encoding === "unknown" ? id3End : id3End + header.frameBytes;
  return {
    encoding,
    layout: {
      audioStart,
      sampleRate: header.sampleRate,
      bitrateKbps: header.bitrateKbps,
      bytesPerFrame: (144 * header.bitrateKbps * 1000) / header.sampleRate,
      frameSeconds: SAMPLES_PER_FRAME / header.sampleRate,
    },
  };
}

export interface ExcerptRange {
  /** Inclusive byte range to request. */
  from: number;
  to: number;
  /** Where the requested start sits in the decoded audio, in seconds (the preroll). */
  offsetSeconds: number;
}

/** The byte range holding [startSeconds, startSeconds + durationSeconds), preroll included. */
export function excerptByteRange(
  layout: Mp3Layout,
  startSeconds: number,
  durationSeconds: number,
): ExcerptRange {
  const target = Math.floor(startSeconds / layout.frameSeconds);
  const first = Math.max(0, target - PREROLL_FRAMES);
  const frames = Math.ceil(durationSeconds / layout.frameSeconds) + (target - first) + 2;
  const from = layout.audioStart + Math.floor(first * layout.bytesPerFrame);
  const to = from + Math.ceil(frames * layout.bytesPerFrame) + SLACK_BYTES;
  const offsetSeconds =
    (target - first) * layout.frameSeconds + (startSeconds - target * layout.frameSeconds);
  return { from, to, offsetSeconds };
}

/**
 * First offset in `bytes` where a frame matching `like` starts AND the next
 * frame does too. One matching header alone isn't enough: 0xFFE… byte pairs
 * occur inside audio data, and decoding from a false sync produces noise.
 */
export function findFrameSync(
  bytes: Uint8Array,
  like: Pick<FrameHeader, "sampleRate" | "bitrateKbps">,
): number {
  const limit = Math.min(bytes.length, SLACK_BYTES);
  for (let i = 0; i < limit; i++) {
    const header = parseFrameHeader(bytes, i);
    if (!header || header.sampleRate !== like.sampleRate || header.bitrateKbps !== like.bitrateKbps)
      continue;
    if (parseFrameHeader(bytes, i + header.frameBytes)) return i;
  }
  return -1;
}

export type Mp3ExcerptFailure = "not-cbr" | "not-mp3" | "no-range-support" | "http" | "no-sync";

export class Mp3ExcerptError extends Error {
  constructor(
    readonly failure: Mp3ExcerptFailure,
    message: string,
  ) {
    super(message);
    this.name = "Mp3ExcerptError";
  }
}

/** Fetches bytes [from, to] of `url`, inclusive. */
export type RangeFetch = (url: string, from: number, to: number) => Promise<Uint8Array>;

/**
 * A RangeFetch over `fetch`. Anything but a 206 is an error, and its body is
 * cancelled unread: a server that ignores Range answers 200 with the entire
 * 100–220MB set, which must never be downloaded by accident.
 */
export function rangeFetcher(fetchFn: typeof fetch = fetch): RangeFetch {
  return async (url, from, to) => {
    const res = await fetchFn(url, { headers: { Range: `bytes=${from}-${to}` } });
    if (res.status !== 206) {
      await res.body?.cancel();
      throw res.ok
        ? new Mp3ExcerptError(
            "no-range-support",
            `expected 206 for a Range request, got ${res.status}`,
          )
        : new Mp3ExcerptError("http", `HTTP ${res.status}`);
    }
    return new Uint8Array(await res.arrayBuffer());
  };
}

/** Reads the file's layout with two small Range requests; refuses anything not CBR. */
async function fetchMp3Layout(url: string, fetchRange: RangeFetch): Promise<Mp3Layout> {
  const id3End = id3TagEnd(await fetchRange(url, 0, 9));
  const probe = await fetchRange(url, id3End, id3End + FIRST_FRAME_PROBE_BYTES - 1);
  const read = readMp3Layout(id3End, probe);
  if (!read)
    throw new Mp3ExcerptError("not-mp3", "no MPEG-1 Layer III frame where the audio should start");
  if (read.encoding !== "cbr") {
    throw new Mp3ExcerptError(
      "not-cbr",
      `variable or unmarked bitrate (${read.encoding}): exact start times aren't possible`,
    );
  }
  return read.layout;
}

export interface Excerpt<T> {
  /** The decoded audio, preroll included. */
  audio: T;
  /** Where the requested start sits in `audio`, in seconds. */
  offsetSeconds: number;
  durationSeconds: number;
  layout: Mp3Layout;
}

/**
 * Fetches and decodes [startSeconds, startSeconds + durationSeconds) of a CBR
 * MP3. `decode` is typically `(data) => audioContext.decodeAudioData(data)`.
 */
export async function fetchExcerpt<T>(
  url: string,
  startSeconds: number,
  durationSeconds: number,
  decode: (data: ArrayBuffer) => Promise<T>,
  fetchRange: RangeFetch = rangeFetcher(),
): Promise<Excerpt<T>> {
  const layout = await fetchMp3Layout(url, fetchRange);
  const range = excerptByteRange(layout, startSeconds, durationSeconds);
  const bytes = await fetchRange(url, range.from, range.to);
  const sync = findFrameSync(bytes, layout);
  if (sync < 0) throw new Mp3ExcerptError("no-sync", "no frame sync in the fetched range");
  // slice() copies into a fresh ArrayBuffer: decodeAudioData detaches its input.
  const audio = await decode(bytes.slice(sync).buffer);
  return { audio, offsetSeconds: range.offsetSeconds, durationSeconds, layout };
}
