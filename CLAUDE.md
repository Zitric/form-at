# Form:at

Monorepo for Form:at — a techno collective based in Glasgow.

## Apps

| App | Path | Purpose |
|-----|------|---------|
| web | `apps/web` | Public website + embedded audio player |

Future apps go in `apps/`. Each app picks its own framework; the default is TanStack Start.

## Architecture

### Audio player — the core feature
Sets must play on locked mobile screens. This is solved with the **Media Session API** in `apps/web/app/components/Player.tsx`. The player is a fixed bottom bar rendered in the root layout, persistent across all routes.

Audio files live on **Cloudflare R2** (free egress). Update the `src` URLs in `apps/web/app/data/sets.ts` to point to your R2 bucket.

### Player state
`PlayerContext` (`app/contexts/player-context.tsx`) is the minimal shared state: just `nowPlaying` and `loadTrack`. The `Player` component owns the `<audio>` element and all playback state locally. This keeps the context simple and avoids prop-drilling.

### Auth (not yet built)
Community features will be gated behind **Better Auth** (self-hosted, open source). The player and sets pages stay fully public — no login required to listen.

## Principles

- **Keep it simple.** Don't add abstractions until there's a clear need. Three similar lines beats a premature helper.
- **No comments that explain what the code does** — names do that. Only comment the non-obvious *why*.
- **Biome only** — no Prettier, no ESLint. Run `pnpm check` to lint and format everything.
- **Shared config in `packages/`** — each app extends `@form-at/tsconfig` via `workspace:*`.

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

Pattern taken from `motors-frontend-master`:
- Root `package.json` is a thin Turbo wrapper — no app code here
- Shared configs live in `packages/`, consumed via `workspace:*`
- Each app's `tsconfig.json` extends the shared base
- Biome config at the root covers all workspaces
