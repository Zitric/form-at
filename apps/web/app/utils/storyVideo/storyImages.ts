// Which images the Story frame loads for a set. Pure, so the fallbacks are
// testable without a browser.

import { getDJ } from "@form-at/data/djs";
import type { MusicSet } from "@form-at/data/sets";

/**
 * The artwork: the optimised 1080 webp Image.tsx serves
 * (`/images/${src}-${w}.webp`), then the uploaded original.
 */
export function artworkUrls(set: MusicSet): string[] {
  return [
    set.artwork ? `/images/${set.artwork}-1080.webp` : null,
    set.artworkOriginalUrl ?? null,
  ].filter((u): u is string => u !== null);
}

/**
 * The DJ's photo for the card, the 1080 webp Image.tsx serves. Same-origin,
 * so it never taints the canvas. null when the set has no DJ or the DJ no
 * photo: the card then shows the artwork.
 */
export function djPhotoUrl(set: MusicSet): string | null {
  const photo = set.djId ? getDJ(set.djId)?.photo : undefined;
  return photo ? `/images/${photo}-1080.webp` : null;
}
