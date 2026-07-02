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

// MB-or-GB byte sizes for offline-library labels. Decimal units (MB = 10^6)
// to match what users see in iOS Settings / Chrome storage panel — binary
// MiB would confuse the comparison. Rounds to whole numbers under 1 GB, one
// decimal at or above 1 GB. Returns `0MB` for non-finite / negative inputs
// rather than throwing — caller is rendering a label, not a precise stat.
export function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0MB";
  if (n < 1_000_000_000) return `${Math.round(n / 1_000_000)}MB`;
  return `${(n / 1_000_000_000).toFixed(1)}GB`;
}

// Renders a list of daily counts as a unicode sparkline (`▁▂▅▇▃▁▁`). The
// tallest bar represents the max value in the window, every other bar scales
// proportionally. Empty arrays return "", all-zero arrays return all `▁`.
export function asciiBar(values: number[]): string {
  if (values.length === 0) return "";
  const max = Math.max(...values);
  const chars = "▁▂▃▄▅▆▇█";
  if (max === 0) return chars[0]?.repeat(values.length) ?? "";
  return values
    .map((v) => {
      const idx = Math.floor((v / max) * (chars.length - 1));
      return chars[idx] ?? "▁";
    })
    .join("");
}

// ISO 3166-1 alpha-2 (e.g. "GB") → 🇬🇧 emoji using regional indicator symbols.
// Returns "" for non-2-letter inputs ("unknown", empty) so callers can guard.
export function countryFlag(code: string): string {
  if (!/^[a-zA-Z]{2}$/.test(code)) return "";
  const upper = code.toUpperCase();
  return String.fromCodePoint(
    0x1f1e6 + upper.charCodeAt(0) - 65,
    0x1f1e6 + upper.charCodeAt(1) - 65,
  );
}
