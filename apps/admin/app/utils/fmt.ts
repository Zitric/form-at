export function fmtDuration(s: number): string {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

// Duplicated rather than shared with apps/web's `fmtBytes` — one consumer per
// app doesn't justify the round-trip through a package.
export function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0MB";
  if (n < 1_000_000_000) return `${Math.round(n / 1_000_000)}MB`;
  return `${(n / 1_000_000_000).toFixed(1)}GB`;
}

// Matches the `sets.duration` column's stored format exactly ("45:18",
// "1:31:55", "2:01:55" — see the migrated rows in schema.sql): `M:SS` under an
// hour, `H:MM:SS` at or above. Needed because neither `fmtDuration` above (a
// stats-label shape, "45s"/"12m"/"1h 5m") nor apps/web's `fmtTimestamp`
// (`M:SS` with no hour rollover — a 95-minute track renders "95:00") produces
// it.
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
