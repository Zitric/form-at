// Formats a number of seconds as `M:SS`. Used wherever we display a position
// within a track (player seeker, share-at-time labels, deeplink URLs).
// Returns `0:00` for non-finite values so seekers don't flash NaN during load.
export function fmtTimestamp(s: number): string {
  if (!Number.isFinite(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function fmtDuration(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

export function fmtDate(ms: number): string {
  return new Date(ms).toISOString().split("T")[0] ?? "";
}
