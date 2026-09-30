// Reads the top-level box structure of a recorded MP4. Chrome and WebKit's
// MediaRecorder both write *fragmented* MP4 (moof/mdat pairs after a moov
// with no samples), and whether Instagram's Story composer handles that is
// still unverified — so the recorder's output is inspected, not assumed.

export interface Mp4Box {
  type: string;
  offset: number;
  size: number;
}

export interface Mp4BoxScan {
  boxes: Mp4Box[];
  /** Offset where parsing stopped on something that isn't a valid box, if it did. */
  invalidAt: number | null;
}

const MAX_BOXES = 10_000;

/** Top-level boxes of `bytes`, in order. */
export function topLevelBoxes(bytes: Uint8Array): Mp4BoxScan {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const boxes: Mp4Box[] = [];
  let offset = 0;
  while (offset + 8 <= bytes.length && boxes.length < MAX_BOXES) {
    let size = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    // size 1: a 64-bit size follows the type. size 0: the box runs to the end.
    if (size === 1) {
      if (offset + 16 > bytes.length) return { boxes, invalidAt: offset };
      size = Number(view.getBigUint64(offset + 8));
    } else if (size === 0) {
      size = bytes.length - offset;
    }
    if (size < 8 || !/^[\x20-\x7e]{4}$/.test(type)) return { boxes, invalidAt: offset };
    boxes.push({ type, offset, size });
    offset += size;
  }
  return { boxes, invalidAt: null };
}

/**
 * The movie duration mvhd declares, in seconds; null without a moov/mvhd.
 * MediaRecorder's fragmented files declare 0 here, however long they are.
 */
export function movieDurationSeconds(bytes: Uint8Array): number | null {
  const moov = topLevelBoxes(bytes).boxes.find((b) => b.type === "moov");
  if (!moov) return null;
  const inner = topLevelBoxes(bytes.subarray(moov.offset + 8, moov.offset + moov.size)).boxes;
  const mvhd = inner.find((b) => b.type === "mvhd");
  if (!mvhd) return null;
  const at = moov.offset + 8 + mvhd.offset + 8; // version + flags start here
  const view = new DataView(bytes.buffer, bytes.byteOffset + at, mvhd.size - 8);
  const version = view.getUint8(0);
  // v0: creation(4) modification(4) timescale(4) duration(4); v1: 8/8/4/8.
  const timescale = view.getUint32(version === 1 ? 20 : 12);
  const duration = version === 1 ? Number(view.getBigUint64(24)) : view.getUint32(16);
  return timescale ? duration / timescale : null;
}

/** Fragmented MP4: media in moof/mdat fragments rather than one moov-indexed mdat. */
export function isFragmented(boxes: readonly Mp4Box[]): boolean {
  return boxes.some((box) => box.type === "moof");
}

/** e.g. "ftyp, moov, moof, mdat, free×3": consecutive same-type boxes collapsed, for diagnostics. */
export function summarizeBoxes(boxes: readonly Mp4Box[]): string {
  const runs: [string, number][] = [];
  for (const { type } of boxes) {
    const last = runs[runs.length - 1];
    if (last && last[0] === type) last[1]++;
    else runs.push([type, 1]);
  }
  return runs.map(([type, count]) => (count > 1 ? `${type}×${count}` : type)).join(", ");
}
