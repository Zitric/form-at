# Form:at — Tech Debt

Engineering-side cleanup and infrastructure items deferred from active work. Product feature ideas live in `IMPROVEMENTS.md`; this file is for code-quality, tooling, and refactor debt only.

Each item is written to be picked up cold — no conversation context required.

---

## 1. Delete dead code flagged by knip

**Scope:** one file — `apps/web/app/utils/ics.ts`.

Remove the two exports:

- `buildGoogleCalendarUrl` (currently around line 81)
- `buildOutlookCalendarUrl` (currently around line 105)

**Why deprecated:** `AddToCalendarButton` downloads a direct `.ics` file. There is no multi-provider calendar picker in the UI and none is planned. Both functions have zero callers outside `ics.ts` itself (verified by grep during the 2026-06-24 knip audit).

**Do NOT delete** `Text` / `Heading` / `Muted` from `apps/web/app/components/Text.tsx`. Knip flags them as unused exports, but they are an intentional design-system surface kept for future use. They get silenced in knip config (item 2 below), not deleted.

**Verification:** `pnpm check` (lint + tsc) + `pnpm test:run` must stay green. Grep for any new callers before deleting in case something landed in the meantime.

---

## 2. knip.json + CI placement

**Scope:** create `apps/web/knip.json` (per-app, not repo-root); then wire knip into CI.

### Minimum config to clear the known false positives

```json
{
  "entry": ["app/sw.ts!"],
  "ignoreBinaries": ["ffmpeg"]
}
```

Why each line:

- `entry: ["app/sw.ts!"]` — the service worker is registered by the browser at runtime via `navigator.serviceWorker.register(...)`, never imported by any ES module. Knip can't see it and flags both the file AND its imports (`workbox-core`, `workbox-precaching`) as unused. The `!` suffix tells knip "this is an intentional entry, don't second-guess it." Single line fixes three knip findings (1 unused file + 2 unused devDependencies).
- `ignoreBinaries: ["ffmpeg"]` — `scripts/generate-peaks.mjs` shells out to system `ffmpeg`. It's a system tool (like `git`), not an npm package. Without this, knip emits an "unlisted binaries" warning every run.

**The `icons/` barrel needs NO rule.** Knip 6 follows re-export chains correctly; the barrel + all six icon re-exports were not flagged during the audit. Verified empirically.

### CI placement

Add knip as a **per-PR check**, parallel to the existing `static` / `unit` / `e2e` jobs in `.github/workflows/ci.yml`. New job runs `pnpm knip`.

**Do NOT** add it as a pre-commit hook. Reason: slow hooks get disabled the moment they get in the way of a fast commit, defeating the point. PR-level cadence fits the many-commits-one-PR flow already in use.

**Verification:** `pnpm knip` exits 0 locally with the config in place; the new CI job passes on a clean PR.

---

## 3. `__root.tsx` extraction

**Scope:** `apps/web/app/routes/__root.tsx` — split one file into several, single responsibility per module.

### What's currently inline

Five distinct concerns share the file:

- `RootNotFound` — the 404 component
- `fontCSS` — inlined `@font-face` CSS string
- `HydrateStore` — store-hydration effect component
- `InstallEventsListener` — `beforeinstallprompt` + `appinstalled` listeners writing to the Zustand store
- The `head()` meta / link / script config (large object literal)

### Constraints

- **Pure mechanical move.** No new abstractions, no consolidation across the five modules, no "while I'm here" cleanups. Split only.
- **No behaviour change.** Same render output, same effects firing in the same order at the same lifecycle moments.
- **Plan first.** Propose the target file paths before touching anything — locking the structure during plan-review avoids re-litigation mid-refactor.

### Verification

- `pnpm check` (lint + tsc) green.
- `pnpm test:run` stays at the current passing count (137 at the time of writing this entry — 2026-06-24).
- Manual smoke test in dev: install flow still wires up, 404 page still renders for an unknown route, fonts still load, store still hydrates.

---

_Last updated: 2026-06-24_
