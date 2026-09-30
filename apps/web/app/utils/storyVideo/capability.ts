// Can this browser make a Story video? Kept apart from recorder.ts on
// purpose: ShareModal asks this on every render, and importing recorder.ts
// there would pull the renderer and spectrum code into the main bundle,
// which StoryVideoFlow's lazy() exists to keep out.

// H.264 + AAC in MP4 only: Instagram's Story video format. Most specific
// first. WebM (all Firefox records) and Opus-in-MP4 are never used, even
// where supported: the file would record fine and then fail at Instagram.
export const STORY_MIME_TYPES = [
  'video/mp4;codecs="avc1.640028,mp4a.40.2"',
  "video/mp4;codecs=avc1,mp4a.40.2",
] as const;

export function pickStoryMimeType(
  isTypeSupported: (type: string) => boolean = (type) =>
    typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(type),
): string | null {
  return STORY_MIME_TYPES.find((type) => isTypeSupported(type)) ?? null;
}

/**
 * Everything recording needs: an H.264 + AAC MP4 MediaRecorder, canvas
 * capture, and Web Audio's stream destination. Share support is NOT checked
 * here; it's asked of the real recorded file afterwards, since a check
 * against a dummy file isn't reliable.
 */
export function canRecordStory(): boolean {
  if (typeof window === "undefined") return false;
  return (
    pickStoryMimeType() !== null &&
    typeof AudioContext !== "undefined" &&
    "createMediaStreamDestination" in AudioContext.prototype &&
    "captureStream" in HTMLCanvasElement.prototype
  );
}
