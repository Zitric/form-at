// Set-upload feature (PR4). The 4 legacy sets (schema.sql, sets.generated.ts)
// are `set-002-til`, `set-002-hubey`, `set-002-brandon-lee-vear`,
// `set-002-julz-lever` — the real convention is `set-{eventSequence}-
// {artistSlug}`, where `002` is the EVENT number (shared across all 4 sets,
// all titled "Form:at 002"), not a slug of the title itself. This generates
// a DEFAULT matching that convention; the id field stays user-editable
// regardless, so the fallback path below doesn't need to be bulletproof.

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const EVENT_SEQUENCE_PATTERN = /form:at\s+0*(\d+)/i;

// Exported for unit tests — same "export pure logic" convention used
// throughout this repo (classifyDownloadFailure, canFetchPlaybackBytes, etc).
export function slugifySetId(title: string, artist: string): string {
  const artistSlug = slugify(artist);
  const match = EVENT_SEQUENCE_PATTERN.exec(title);
  if (match?.[1]) {
    const sequence = match[1].padStart(3, "0");
    return `set-${sequence}-${artistSlug}`;
  }
  // Title doesn't follow the "Form:at NNN" convention (a one-off event) —
  // fall back to a plain title+artist slug. Not the common path; the field
  // is editable either way.
  return `set-${slugify(title)}-${artistSlug}`;
}
