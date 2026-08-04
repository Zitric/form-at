export function fmtDuration(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

// Set-upload feature (PR4) — file-size display for the upload form (audio
// file size hint, per-file progress). Same shape as apps/web's own
// `fmtBytes` (used for save_for_offline labels) — small enough to duplicate
// rather than round-trip through a shared package for one consumer per app.
export function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0MB";
  if (n < 1_000_000_000) return `${Math.round(n / 1_000_000)}MB`;
  return `${(n / 1_000_000_000).toFixed(1)}GB`;
}

// Set-upload feature (PR4) — matches the `sets.duration` column's actual
// stored format exactly ("45:18", "1:31:55", "2:01:55" — confirmed against
// the real migrated rows in schema.sql), which neither `fmtDuration` above
// (a stats-label shape: "45s"/"12m"/"1h 5m") nor apps/web's `fmtTimestamp`
// (`M:SS` with no hour rollover — a 95-minute track would render "95:00",
// not "1:35:00") actually produces. `M:SS` under an hour, `H:MM:SS` at/above.
export function fmtSetDuration(totalSeconds: number): string {
  const s = Math.floor(totalSeconds);
  const sec = s % 60;
  const totalMinutes = Math.floor(s / 60);
  const min = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const secStr = sec.toString().padStart(2, "0");
  if (hours > 0) return `${hours}:${min.toString().padStart(2, "0")}:${secStr}`;
  return `${min}:${secStr}`;
}
