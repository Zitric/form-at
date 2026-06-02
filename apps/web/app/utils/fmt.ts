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
