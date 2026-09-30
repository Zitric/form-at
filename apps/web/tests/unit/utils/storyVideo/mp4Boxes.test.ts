import { describe, expect, it } from "vitest";
import { isFragmented, summarizeBoxes, topLevelBoxes } from "~/utils/storyVideo/mp4Boxes";

function box(type: string, payload = 0): Uint8Array {
  const out = new Uint8Array(8 + payload);
  new DataView(out.buffer).setUint32(0, 8 + payload);
  out.set(
    Array.from(type, (c) => c.charCodeAt(0)),
    4,
  );
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

const types = (bytes: Uint8Array) => topLevelBoxes(bytes).boxes.map((b) => b.type);

describe("topLevelBoxes", () => {
  it("lists the boxes of a fragmented recording, like Chrome's and WebKit's MediaRecorder output", () => {
    const file = concat(
      box("ftyp", 16),
      box("moov", 40),
      box("moof", 12),
      box("mdat", 100),
      box("moof", 12),
      box("mdat", 80),
    );
    const { boxes, invalidAt } = topLevelBoxes(file);
    expect(boxes.map((b) => b.type)).toEqual(["ftyp", "moov", "moof", "mdat", "moof", "mdat"]);
    expect(boxes[2]).toEqual({ type: "moof", offset: 24 + 48, size: 20 });
    expect(invalidAt).toBeNull();
    expect(isFragmented(boxes)).toBe(true);
  });

  it("tells a plain MP4 from a fragmented one", () => {
    expect(
      isFragmented(topLevelBoxes(concat(box("ftyp"), box("moov"), box("mdat", 10))).boxes),
    ).toBe(false);
  });

  it("reads a 64-bit box size", () => {
    const large = new Uint8Array(24);
    const view = new DataView(large.buffer);
    view.setUint32(0, 1);
    large.set([0x6d, 0x64, 0x61, 0x74], 4); // "mdat"
    view.setBigUint64(8, 24n);
    expect(topLevelBoxes(concat(box("ftyp"), large)).boxes[1]).toEqual({
      type: "mdat",
      offset: 8,
      size: 24,
    });
  });

  it("runs a size-0 box to the end", () => {
    const tail = box("mdat", 20);
    new DataView(tail.buffer).setUint32(0, 0);
    expect(topLevelBoxes(concat(box("ftyp"), tail)).boxes[1]?.size).toBe(28);
  });

  it("stops at something that isn't a box, and says where", () => {
    const junk = new Uint8Array(8);
    new DataView(junk.buffer).setUint32(0, 4); // smaller than a box header
    expect(topLevelBoxes(concat(box("ftyp"), junk))).toMatchObject({ invalidAt: 8 });
    const binaryType = box("moov");
    binaryType[4] = 0x00;
    expect(topLevelBoxes(binaryType).invalidAt).toBe(0);
  });

  it("ignores a trailing partial header", () => {
    expect(types(concat(box("ftyp"), new Uint8Array(5)))).toEqual(["ftyp"]);
  });
});

describe("summarizeBoxes", () => {
  it("collapses consecutive runs only", () => {
    const file = concat(
      box("ftyp"),
      box("moov"),
      box("moof"),
      box("mdat"),
      box("free"),
      box("free"),
      box("free"),
    );
    expect(summarizeBoxes(topLevelBoxes(file).boxes)).toBe("ftyp, moov, moof, mdat, free×3");
  });
});
