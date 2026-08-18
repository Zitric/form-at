# apps/web

The public site and audio player — [formatglasgow.com](https://formatglasgow.com).
A PWA: installable, and a saved set plays with no signal.

Framework is TanStack Start v1 on the Cloudflare Workers runtime. The engineering
narrative — why IndexedDB over Cache Storage, why the service worker is
hand-written, why the catalogue is both a D1 table and a committed snapshot —
lives in the [root README](../../README.md) and isn't repeated here.

```bash
pnpm dev:web      # :5173
pnpm test:web     # unit (Vitest + jsdom)
pnpm -C apps/web test:e2e
```

**Service-worker behaviour only exists in a production build.** The dev server
never registers one, because Vite's dev transform emits no `sw.js`. For anything
touching install, offline, offline audio or Range seeking:

```bash
pnpm build:web && pnpm start:web   # :4173, real service worker
```

## Layout

| Path | |
|---|---|
| `app/routes/` | file-based routes; `api/` holds pure endpoints (no component) |
| `app/components/` | app-coupled components — anything tied to Zustand, the router, or this app's asset-URL scheme. Generic presentational pieces live in `packages/ui` |
| `app/hooks/` | `useAudioPlayer` owns all playback logic; `Player.tsx` is layout only |
| `app/store/` | Zustand slices, composed in `index.ts` |
| `app/data/` | catalogue, DJs, events, offline-audio IDB access |
| `app/sw.ts` | the service worker, built by `buildServiceWorker` in `vite.config.ts` |
| `schema.sql` | D1 schema for the whole project, including tables only `apps/admin` and `apps/rum-archiver` read. **Never apply it with `--file`** — it holds non-idempotent `ALTER`s |

Sub-directory docs: [`scripts/`](scripts/README.md) for every build and ops
script, [`tests/`](tests/README.md) for test conventions,
[`images-source/`](images-source/README.md) for the image pipeline.

## Things that break quietly

These have each cost a debugging session; the full list and reasoning is in
[`CLAUDE.md`](../../CLAUDE.md) §1.

- **Never add `self.skipWaiting()` to `app/sw.ts`.** It prunes the previous
  build's chunks while old clients are still running them, so the next lazy
  route-load 404s.
- **Never rebuild the `Request` in the SW's audio route.** It silently drops the
  `Range` header, so seeks re-download from byte 0. No unit test can catch it —
  Node's undici doesn't implement the guard that causes it.
- **Never remove the `@source` directive** from `app/styles/global.css`, or
  Tailwind strips every class used only inside `packages/ui`.
