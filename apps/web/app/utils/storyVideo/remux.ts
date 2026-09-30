// Rewrites MediaRecorder's fragmented MP4 as an ordinary one, without
// re-encoding a single frame.
//
// Chrome's MediaRecorder writes fragmented MP4: a moov that indexes no
// samples, mvhd duration 0, no mehd, and tkhd/mdhd durations that only cover
// the FIRST fragment (~3.4s), followed by moof/mdat pairs holding the media.
// Players that walk the fragments (ffprobe, browsers) see the whole file.
// Instagram's Story import didn't: shared straight from the app it kept ~5s
// of a 20s story, and the phone's gallery showed a 5s file as "0:03".
//
// The output has one moov, first ("fast start"), with full sample tables and
// true durations, then one mdat. Encoded samples are copied as they are —
// verified packet-for-packet with ffmpeg's framemd5 against a real recording
// — so this costs milliseconds and changes no pixel or sample.
//
// mediabunny is imported only from here, and this only from recorder.ts, so
// it ships in StoryVideoFlow's lazy chunk (CLAUDE.md §1's lazy rule).

import {
  BlobSource,
  BufferTarget,
  Conversion,
  Input,
  MP4,
  Mp4OutputFormat,
  Output,
} from "mediabunny";

export async function toProgressiveMp4(recording: Blob): Promise<Uint8Array<ArrayBuffer>> {
  // Only the MP4 demuxer: ALL_FORMATS would pull every container into the
  // bundle.
  const input = new Input({ formats: [MP4], source: new BlobSource(recording) });
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: "in-memory" }),
    target: new BufferTarget(),
  });
  // "forced": a track that can't be copied is dropped rather than re-encoded.
  // A dropped track would make a story without its sound or picture, so it
  // is an error here, never a result.
  const conversion = await Conversion.init({ input, output, copy: { mode: "forced" } });
  if (!conversion.isValid || conversion.discardedTracks.length > 0) {
    const reasons = conversion.discardedTracks.map((t) => t.reason).join(", ");
    throw new Error(`can't remux the recording without re-encoding (${reasons || "invalid"})`);
  }
  await conversion.execute();
  const buffer = output.target.buffer;
  if (!buffer) throw new Error("remux produced no output");
  return new Uint8Array(buffer);
}
