#!/usr/bin/env node
// Writes the current branch's changes to per-area files under `.diff-dump/`,
// ready to hand to someone for review without copying anything by hand.
//
// Usage: pnpm dump-diff
//
// WHAT IT DIFFS, and why that base: the merge-base of `origin/main` and HEAD,
// compared against the WORKING TREE. That captures committed-on-branch, staged
// and unstaged changes in one pass, so there's never a question of which state
// was dumped. Using `origin/main` directly would be wrong once main moves ahead
// — commits that landed on main but not here would show up as deletions, which
// reads as this branch having removed them.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, ".diff-dump");

const git = (...args) =>
  execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });

// Generated or machine-owned files. Nobody reviews these and they drown the
// real diff — but every one that actually changed is NAMED in the summary, so
// an exclusion can never quietly hide a change someone should have seen.
const EXCLUDE = [
  { pattern: /(^|\/)pnpm-lock\.yaml$/, why: "lockfile" },
  { pattern: /(^|\/)routeTree\.gen\.ts$/, why: "TanStack Router code-gen" },
  { pattern: /(^|\/)sets\.generated\.ts$/, why: "build-time D1 snapshot" },
  { pattern: /(^|\/)(dist|build)\//, why: "build output" },
  { pattern: /(^|\/)test-results\//, why: "Playwright run artefacts" },
  { pattern: /(^|\/)storybook-static\//, why: "Storybook build" },
  { pattern: /\.(png|jpe?g|webp|avif|ico|woff2?|mp3)$/i, why: "binary asset" },
];

// Ordered: the first matching area wins, so `apps/rum-archiver` must be listed
// before any broader `apps/` rule would be. Anything unmatched lands in
// `other`, so no changed file can silently fail to appear anywhere.
const AREAS = [
  { file: "packages.diff", label: "packages/*", match: (f) => f.startsWith("packages/") },
  { file: "apps-web.diff", label: "apps/web", match: (f) => f.startsWith("apps/web/") },
  { file: "apps-admin.diff", label: "apps/admin", match: (f) => f.startsWith("apps/admin/") },
  {
    file: "apps-rum-archiver.diff",
    label: "apps/rum-archiver",
    match: (f) => f.startsWith("apps/rum-archiver/"),
  },
  {
    file: "config.diff",
    label: "workflows + config",
    match: (f) =>
      f.startsWith(".github/") ||
      /^[^/]*\.(json|toml|ya?ml|js|mjs|ts)$/.test(f) ||
      f === ".gitignore" ||
      f.startsWith("scripts/"),
  },
  { file: "docs.diff", label: "docs", match: (f) => f.endsWith(".md") },
];
const OTHER = { file: "other.diff", label: "everything else" };

function resolveBase() {
  try {
    git("fetch", "origin", "--quiet");
  } catch {
    console.warn("! could not fetch origin — using the local origin/main ref, which may be stale");
  }
  try {
    return git("merge-base", "origin/main", "HEAD").trim();
  } catch {
    console.error("Could not resolve a merge-base with origin/main. Is the remote configured?");
    process.exit(1);
  }
}

const base = resolveBase();
const branch = git("rev-parse", "--abbrev-ref", "HEAD").trim();

const changed = git("diff", "--name-only", base).split("\n").filter(Boolean);
if (changed.length === 0) {
  console.log(`No changes on ${branch} against origin/main. Nothing written.`);
  // Still clear a previous run's files, so nothing stale is handed over.
  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true });
  process.exit(0);
}

const excluded = [];
const included = [];
for (const file of changed) {
  const hit = EXCLUDE.find((e) => e.pattern.test(file));
  if (hit) excluded.push({ file, why: hit.why });
  else included.push(file);
}

// Assign every included file to exactly one area; leftovers go to `other`.
const buckets = new Map(AREAS.map((a) => [a.file, { area: a, files: [] }]));
buckets.set(OTHER.file, { area: OTHER, files: [] });
for (const file of included) {
  const area = AREAS.find((a) => a.match(file)) ?? OTHER;
  buckets.get(area.file).files.push(file);
}

mkdirSync(OUT_DIR, { recursive: true });

// Remove anything left from a previous run before writing. A leftover file from
// an earlier branch is exactly the kind of quiet wrongness this is meant to
// avoid — it would be handed over as if it were current.
for (const stale of readdirSync(OUT_DIR)) rmSync(join(OUT_DIR, stale));

const written = [];
const empty = [];
for (const { area, files } of buckets.values()) {
  if (files.length === 0) {
    empty.push(area.label);
    continue;
  }
  const body = git("diff", base, "--", ...files);
  if (!body.trim()) {
    empty.push(area.label);
    continue;
  }
  const path = join(OUT_DIR, area.file);
  writeFileSync(path, body);
  written.push({ path, label: area.label, lines: body.split("\n").length, files: files.length });
}

const stat = git("diff", "--stat", base, "--", ...included);
const summary = [
  `Branch:   ${branch}`,
  `Base:     ${base} (merge-base with origin/main)`,
  "Compared: working tree — includes committed, staged and unstaged changes",
  "",
  "── Changed files ──────────────────────────────────────────",
  stat.trimEnd(),
  "",
  "── Excluded from the diffs (generated / machine-owned) ─────",
  excluded.length
    ? excluded.map((e) => `  ${e.file}  (${e.why})`).join("\n")
    : "  none — nothing generated changed on this branch",
  "",
  "── Areas with no changes (no file written) ─────────────────",
  empty.length ? empty.map((l) => `  ${l}`).join("\n") : "  none — every area has changes",
  "",
].join("\n");
writeFileSync(join(OUT_DIR, "summary.txt"), `${summary}\n`);

console.log(`\n${branch}  →  .diff-dump/\n`);
console.log(
  `  ${"summary.txt".padEnd(26)} ${String(summary.split("\n").length).padStart(6)} lines`,
);
for (const w of written) {
  const name = w.path.slice(OUT_DIR.length + 1);
  console.log(
    `  ${name.padEnd(26)} ${String(w.lines).padStart(6)} lines  (${w.files} file${w.files === 1 ? "" : "s"}, ${w.label})`,
  );
}
if (empty.length) console.log(`\n  no changes in: ${empty.join(", ")}`);
if (excluded.length) {
  console.log(`  excluded ${excluded.length} generated file(s) — named in summary.txt`);
}
console.log();
