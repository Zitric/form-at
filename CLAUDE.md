# Form:at

Monorepo for Form:at — a techno collective based in Glasgow.
Live at [formatglasgow.com](https://formatglasgow.com)

## Apps

| App | Path | Purpose |
|-----|------|---------|
| web | `apps/web` | Public website + embedded audio player |

Future apps go in `apps/`. Each app picks its own framework; the default is TanStack Start.

## Architecture

### Audio player — the core feature
Sets must play on locked mobile screens. This is solved with the **Media Session API**. The player is a persistent fixed bottom bar rendered in `__root.tsx`, surviving all route changes.

Audio files live on **Cloudflare R2** (free egress). Update the `src` URLs in `apps/web/app/data/sets.ts` to point to your R2 bucket.

All audio logic lives in `apps/web/app/hooks/useAudioPlayer.ts` — track loading, spacebar/media key support, `sendBeacon` analytics, `beforeunload` position save, Media Session API. `Player.tsx` is layout only.

### Player state
Global state is managed by **Zustand** (`apps/web/app/store/`). The store is split into slices:

- `playerSlice.ts` — `nowPlaying`, `isPlaying`, `positions` (per-track resume map), and their setters
- `store/index.ts` — composes slices, persists `nowPlayingId` + `positions` to localStorage via `zustand/middleware/persist`

`MusicSet` objects are never stored in localStorage — only IDs are persisted and hydrated back via `getSet()` on load. This avoids migration risk if the shape changes.

The `isPlaying` flag in the store is the control surface for external components. `useAudioPlayer` has a bridge effect that watches it and calls `audio.pause()` / `audio.play()` accordingly.

### Navigation
`SwipeNavigator` (`apps/web/app/components/SwipeNavigator.tsx`) wraps the `<Outlet />` and provides horizontal swipe navigation between the four main routes (`/`, `/sets`, `/events`, `/djs`). Uses `@use-gesture/react` for real-time drag tracking. On swipe confirm, a `cloneNode` snapshot of the outgoing page animates out via direct DOM manipulation while the new page slides in via React state + double `requestAnimationFrame`.

A gold dot indicator sits above `BottomNav` on mobile, showing the current page position. It animates in real-time during drag via direct DOM style updates (no React re-renders).

### Analytics — play tracking
Listen events are tracked via `navigator.sendBeacon` (fire-and-forget, survives page close). `useAudioPlayer` calls `/api/track` on pause, track change, and tab close — ignoring plays under 3 seconds. Data lands in a **Cloudflare D1** SQLite database (`form-at-analytics`, table: `plays`).

Play counts are shown on the `/sets` page via a `createServerFn` loader that queries D1 at SSR time.

### Server entry and Cloudflare env
TanStack Start v1.167 uses pure Vite (no Nitro/Vinxi). The custom server entry at `apps/web/app/server.ts` handles Cloudflare's `fetch(request, env, ctx)` calling convention and forwards `env.DB` as `context.cloudflare.env`. This makes D1 accessible in both `server.handlers` route handlers and `createServerFn` handlers via `(context as unknown as Record<string, unknown>).cloudflare`.

**Without this entry, D1 is unreachable from any server-side code.**

### API routes
TanStack Start v1.167 does not have `createAPIFileRoute`. Use `createFileRoute` with a `server: { handlers }` option instead:

```ts
export const Route = createFileRoute("/api/example")({
  server: {
    handlers: {
      POST: async ({ request, context }) => {
        // context.cloudflare?.env?.DB is available here
        return new Response(null, { status: 204 });
      },
    },
  },
});
```

Routes with only `server.handlers` and no `component` are pure API endpoints — TanStack Router will never try to render them.

### Deployment
Deployed to **Cloudflare Pages**. The D1 binding `DB` is configured in `wrangler.toml` and must also be added in the CF Pages dashboard under Settings → Functions → D1 database bindings.

Schema lives in `apps/web/schema.sql`. Apply to the remote DB with:
```bash
npx wrangler d1 execute form-at-analytics --remote --file=apps/web/schema.sql
```

**Cloudflare Web Analytics** is auto-injected for `formatglasgow.com` — no script tag needed.

### Auth (not yet built)
Community features will be gated behind **Better Auth** (self-hosted, open source). The player and sets pages stay fully public — no login required to listen.

## Principles

- **Keep it simple.** Don't add abstractions until there's a clear need. Three similar lines beats a premature helper.
- **No comments that explain what the code does** — names do that. Only comment the non-obvious *why*.
- **Biome only** — no Prettier, no ESLint. Run `pnpm check` to lint and format everything.
- **Shared config in `packages/`** — each app extends `@form-at/tsconfig` via `workspace:*`.

## Code standards

### Reusable components
- Extract a component when the same UI or behaviour appears in more than one place, or when a single file is getting hard to scan.
- Components live in `apps/web/app/components/`. Name them after what they *are*, not where they're used (`TrackRow`, not `SetsPageTrackRow`).
- Keep props minimal and typed. Prefer explicit prop interfaces over spreading unknown objects.

### Modern patterns
- **TypeScript strict mode** — no `any` unless there is a documented reason (e.g. CF env casting). Use `unknown` + narrowing instead.
- **`const` over `let`**, arrow functions for callbacks, destructuring over repeated property access.
- **Server functions** via `createServerFn` for all data fetching — no raw `fetch` calls to internal API routes from client code.
- **`useCallback` / `useMemo`** only when there is a measurable performance reason or a dependency array requires a stable reference. Don't add them pre-emptively.
- Prefer native Web APIs (`fetch`, `URL`, `Request`, `Response`) over wrapper libraries for simple cases.

### File and naming conventions
- File names: `kebab-case` for routes and utilities, `PascalCase` for component files (`Player.tsx`, `Header.tsx`).
- One component or one logical unit per file. Co-locate the types it needs unless they're shared.
- Route files own their loader, server functions, and page component. Only extract when a file exceeds ~150 lines or a piece is reused elsewhere.
- Custom hooks live in `apps/web/app/hooks/`.

### Styling
- Tailwind utility classes only — no inline `style` props except for dynamic values (e.g. animation offsets).
- Design tokens are in `apps/web/app/styles/tokens.ts` (JS/canvas use) and mirrored in the `@theme` block of `global.css` (Tailwind use). Keep them in sync.
- Brand colours: `bg-black` (`#161615`), `text-gold` (`#c58538`), `text-purple` (`#43437a`), `text-grey` (`#cbcbcb`), `font-mono` (Space Mono).
- No rounded corners — the brand aesthetic is sharp edges throughout.

## Commands

```bash
pnpm install          # install all workspaces
pnpm dev              # run all apps in dev mode (also generates routeTree.gen.ts on first run)
pnpm build            # build all apps via Turbo
pnpm check            # Biome lint + format across the whole repo
```

## First run

After `pnpm install`, running `pnpm dev` will auto-generate `apps/web/app/routeTree.gen.ts` (TanStack Router code-gen). This file is gitignored — it regenerates on every dev start.

## Structure reference

- Root `package.json` is a thin Turbo wrapper — no app code here
- Shared configs live in `packages/`, consumed via `workspace:*`
- Each app's `tsconfig.json` extends the shared base
- Biome config at the root covers all workspaces
- `apps/web/app/server.ts` — custom Cloudflare server entry (do not delete)
- `apps/web/app/store/` — Zustand store (playerSlice + persist middleware)
- `apps/web/app/hooks/` — custom hooks (useAudioPlayer)
- `apps/web/app/styles/tokens.ts` — design token JS source of truth
- `wrangler.toml` — at repo root, configures Cloudflare Pages + D1 binding
