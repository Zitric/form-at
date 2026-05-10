#!/usr/bin/env node
/**
 * Pulls all play analytics from the production Cloudflare D1 database
 * and prints a summary report to the terminal.
 *
 * Usage:
 *   pnpm stats              # full report
 *   pnpm stats --raw        # also dump the raw JSON for each section
 */

import { execSync } from "node:child_process";

const DB = "form-at-analytics";
const RAW = process.argv.includes("--raw");

function query(sql) {
  // Collapse whitespace so the SQL is safe to pass on the command line.
  const oneLine = sql.replace(/\s+/g, " ").trim();
  const out = execSync(
    `npx wrangler d1 execute ${DB} --remote --json --command "${oneLine.replace(/"/g, '\\"')}"`,
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const start = out.indexOf("[");
  if (start === -1) throw new Error(`No JSON in wrangler output:\n${out}`);
  const parsed = JSON.parse(out.slice(start));
  return parsed[0]?.results ?? [];
}

const fmtDuration = (s) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${sec}s` : `${sec}s`;
};

const fmtDate = (ms) => {
  if (!ms) return "—";
  const d = new Date(Number(ms));
  return Number.isNaN(d.getTime()) ? "—" : d.toISOString().slice(0, 16).replace("T", " ");
};

const pad = (str, n) => String(str).padEnd(n);

function section(title) {
  console.log(`\n\x1b[1m── ${title} ──────────────────────────────\x1b[0m`);
}

// ── Per-set stats ──────────────────────────────────────────────────────────
section("PER-SET STATS");
const perSet = query(`
  SELECT set_id, set_title, set_artist,
         COUNT(*) AS plays,
         SUM(listened_seconds) AS total_seconds,
         ROUND(AVG(listened_seconds)) AS avg_seconds,
         MIN(started_at) AS first_play,
         MAX(started_at) AS last_play
  FROM plays
  GROUP BY set_id
  ORDER BY plays DESC
`);

console.log(
  `${pad("set_id", 30)} ${pad("artist", 14)} ${pad("plays", 7)} ${pad("total", 12)} ${pad("avg", 10)} ${pad("first", 17)} ${pad("last", 17)}`,
);
for (const r of perSet) {
  console.log(
    `${pad(r.set_id, 30)} ${pad(r.set_artist, 14)} ${pad(r.plays, 7)} ${pad(fmtDuration(r.total_seconds), 12)} ${pad(fmtDuration(r.avg_seconds), 10)} ${pad(fmtDate(r.first_play), 17)} ${pad(fmtDate(r.last_play), 17)}`,
  );
}

// ── Totals ─────────────────────────────────────────────────────────────────
section("OVERALL TOTALS");
const totals = query(`
  SELECT COUNT(*) AS plays,
         COUNT(DISTINCT set_id) AS unique_sets,
         COUNT(DISTINCT country) AS countries,
         SUM(listened_seconds) AS total_seconds,
         ROUND(AVG(listened_seconds)) AS avg_seconds
  FROM plays
`)[0];
console.log(`plays:           ${totals.plays}`);
console.log(`unique sets:     ${totals.unique_sets}`);
console.log(`countries:       ${totals.countries}`);
console.log(`total listened:  ${fmtDuration(totals.total_seconds)}`);
console.log(`avg per play:    ${fmtDuration(totals.avg_seconds)}`);

// ── Countries ──────────────────────────────────────────────────────────────
section("BY COUNTRY");
const countries = query(`
  SELECT country, COUNT(*) AS plays, SUM(listened_seconds) AS total_seconds
  FROM plays
  GROUP BY country
  ORDER BY plays DESC
`);
for (const r of countries) {
  console.log(`${pad(r.country, 6)} ${pad(r.plays, 6)} plays   ${fmtDuration(r.total_seconds)}`);
}

// ── Country × set ──────────────────────────────────────────────────────────
section("COUNTRY × SET");
const matrix = query(`
  SELECT set_id, country, COUNT(*) AS plays
  FROM plays
  GROUP BY set_id, country
  ORDER BY set_id, plays DESC
`);
for (const r of matrix) {
  console.log(`${pad(r.set_id, 30)} ${pad(r.country, 6)} ${r.plays}`);
}

// ── Daily breakdown ────────────────────────────────────────────────────────
section("BY DAY");
const daily = query(`
  SELECT DATE(started_at / 1000, 'unixepoch') AS day,
         COUNT(*) AS plays,
         SUM(listened_seconds) AS total_seconds
  FROM plays
  GROUP BY day
  ORDER BY day DESC
`);
for (const r of daily) {
  console.log(`${pad(r.day, 12)} ${pad(r.plays, 6)} plays   ${fmtDuration(r.total_seconds)}`);
}

if (RAW) {
  section("RAW DATA");
  console.log(JSON.stringify({ perSet, totals, countries, matrix, daily }, null, 2));
}

console.log();
