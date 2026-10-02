// The fine-resolution peaks file (`peaks-fine.bin` in a set's version folder):
// one value per 0.1s of the set, the loudest absolute sample across both
// channels in that window. The Story picker's zoomed strip draws from it, so
// dragging needs no audio download (apps/web/app/components/story/).
// Shared by the generator (apps/web/scripts/generate-peaks.ts), the admin
// upload's validation and the picker. Pure: no Node or DOM APIs.
//
// Layout, little-endian, 16-byte header then one byte per value:
//   0  "FPKS"            magic
//   4  u8   1            format version
//   5  u8   1            encoding: 1 = square-root companded (below)
//   6  u16  10           values per second
//   8  u32  n            value count
//   12 f32  scale        the set's loudest value; byte 255 stands for it
//   16 u8 × n            values
//
// Square-root companding: a byte is round(sqrt(peak / scale) × 255) and
// decodes as (byte / 255)² × scale. The zoomed strip rescales to whatever is
// in view, so a quiet passage is drawn at full height and its steps show.
// Linear bytes leave values under a tenth of the set's loudest ~24 levels
// and up to ~18% error; the square root gives them ~56 levels and under 4%.
// Above a quarter of the loudest the two are on par, and the loud sets in
// the catalogue never zoom into anything quieter, so this is for a quiet
// intro or outro. finePeaks.test.ts measures both.

const MAGIC = [0x46, 0x50, 0x4b, 0x53]; // "FPKS"
const FORMAT_VERSION = 1;
const ENCODING_SQRT_U8 = 1;
const HEADER_BYTES = 16;

export const FINE_PEAKS_PER_SECOND = 10;

export type FinePeaks = {
  valuesPerSecond: number;
  /** The set's loudest value; decoded values run from 0 to this. */
  scale: number;
  /** One per 1 / valuesPerSecond seconds, from the start of the set. */
  values: Float32Array;
};

export class FinePeaksFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FinePeaksFormatError";
  }
}

export function encodeFinePeaks(
  peaks: ArrayLike<number>,
  valuesPerSecond: number = FINE_PEAKS_PER_SECOND,
): Uint8Array<ArrayBuffer> {
  let scale = 0;
  for (let i = 0; i < peaks.length; i++) scale = Math.max(scale, Math.abs(peaks[i] ?? 0));
  const out = new Uint8Array(HEADER_BYTES + peaks.length);
  const view = new DataView(out.buffer);
  MAGIC.forEach((b, i) => view.setUint8(i, b));
  view.setUint8(4, FORMAT_VERSION);
  view.setUint8(5, ENCODING_SQRT_U8);
  view.setUint16(6, valuesPerSecond, true);
  view.setUint32(8, peaks.length, true);
  view.setFloat32(12, scale, true);
  for (let i = 0; i < peaks.length; i++) {
    out[HEADER_BYTES + i] =
      scale > 0 ? Math.round(Math.sqrt(Math.abs(peaks[i] ?? 0) / scale) * 255) : 0;
  }
  return out;
}

export function decodeFinePeaks(input: ArrayBuffer | Uint8Array): FinePeaks {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.length < HEADER_BYTES) throw new FinePeaksFormatError("shorter than the header");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (MAGIC.some((b, i) => view.getUint8(i) !== b)) throw new FinePeaksFormatError("not FPKS");
  if (view.getUint8(4) !== FORMAT_VERSION) {
    throw new FinePeaksFormatError(`format version ${view.getUint8(4)}`);
  }
  if (view.getUint8(5) !== ENCODING_SQRT_U8) {
    throw new FinePeaksFormatError(`encoding ${view.getUint8(5)}`);
  }
  const valuesPerSecond = view.getUint16(6, true);
  const count = view.getUint32(8, true);
  const scale = view.getFloat32(12, true);
  if (valuesPerSecond === 0) throw new FinePeaksFormatError("0 values per second");
  if (!Number.isFinite(scale) || scale < 0) throw new FinePeaksFormatError(`scale ${scale}`);
  if (bytes.length !== HEADER_BYTES + count) {
    throw new FinePeaksFormatError(
      `${count} values declared, ${bytes.length - HEADER_BYTES} present`,
    );
  }
  const values = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const b = (bytes[HEADER_BYTES + i] ?? 0) / 255;
    values[i] = b * b * scale;
  }
  return { valuesPerSecond, scale, values };
}

/** How long the set is, by the file's own count. */
export function finePeaksSeconds(peaks: FinePeaks): number {
  return peaks.values.length / peaks.valuesPerSecond;
}
