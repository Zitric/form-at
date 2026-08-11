# Tests

Covers `apps/web`. The other workspaces test themselves the same way and have
no separate README: `apps/admin` has its own `tests/unit` + `tests/e2e`,
`apps/rum-archiver` has `tests/` (Vitest only — a cron Worker has no browser
surface to drive), and `packages/ui` co-locates a `.test.tsx` beside each
component (its interaction tests run Storybook stories through Vitest via
`composeStories`). Run everything at once from the repo root with `pnpm test` /
`pnpm test:e2e`.

Two layers, both wired into the workspace:

| Layer | Tool      | Lives in     | What it tests                                      |
|-------|-----------|--------------|----------------------------------------------------|
| Unit  | Vitest    | `tests/unit` | Pure logic — store actions, hooks, components, utils |
| E2E   | Playwright| `tests/e2e`  | Real browser flows — navigation, player, routes    |

## Running

```bash
pnpm test            # vitest watch (DX local)
pnpm test:run        # vitest run (CI)
pnpm test:ui         # vitest UI dashboard

pnpm test:e2e        # playwright (boots dev server automatically)
pnpm test:e2e:ui     # playwright UI mode (great for debugging)
```

The Playwright `webServer` boots `pnpm dev` itself, so don't start it manually.
First run also needs `pnpm exec playwright install` to pull browser binaries.

## Layout

```
tests/
├── unit/
│   ├── store/         # Zustand slices (playerSlice, catalogueSlice, rehydration)
│   ├── hooks/         # useAudioPlayer*, useFirstLoad, useOfflineDownload…
│   ├── components/    # BookingsButton, CatalogueSync, etc. (shared design-system
│   │                  #   components live in packages/ui and are tested there)
│   ├── utils/         # fmt, appContext, deeplink, installCapability…
│   ├── data/          # beacon-queue, sets, setsForRoute (the D1-fallback logic)
│   ├── routes/        # API handlers — api-signal, api-event, api-push-subscribe
│   └── scripts/       # build scripts (optimize-images)
├── e2e/
│   ├── home.spec.ts        # Manifesto, CTA, social links
│   ├── sets.spec.ts        # List + info → detail flow
│   ├── events.spec.ts      # List + lineup links
│   ├── djs.spec.ts         # Residents/guests sections
│   ├── player.spec.ts      # Audio + controls (mocks R2 with silent MP3)
│   ├── navigation.spec.ts  # Top/bottom nav routing
│   └── _helpers.ts         # shared gotoAndHydrate helper, not a spec
└── setup.ts          # jest-dom matchers, jsdom HTMLMediaElement stubs
```

## Conventions

- **Co-locate by concern, not by file path.** A `Card` test goes in `tests/unit/components/Card.test.tsx`, not next to `app/components/Card.tsx`.
- **Test behaviour, not implementation.** Prefer `getByRole` / `getByText` over CSS selectors or `data-testid`.
- **Assert what the user sees** — visible text, ARIA labels, URLs.
- **No snapshot tests.** They rot fast and don't catch regressions worth catching.
- **Mock the network in E2E**, never the implementation. See `player.spec.ts` for the R2 audio route stub pattern.

## Adding a test

1. Pick the right folder (unit vs e2e).
2. Mirror an existing file's style.
3. Run `pnpm test:run` and `pnpm test:e2e` locally before pushing.

## Known quirks

- **A label that is a prefix of another label breaks `getByText` and `hasText`.** Both match on substring, so adding a `// visits_history` card silently made the existing `getByText("// visits")` resolve to two elements and fail strict mode — a passing test broken by a change to a *different* card. Use `{ exact: true }`, and scope a card with `.filter({ has: page.getByText(label, { exact: true }) })` rather than `.filter({ hasText: label })`, which has no exact option.
- **Playwright runs `workers: 1`** locally — Vite's dev server races on parallel route loads. CI keeps the same setting.
- **`useFirstLoad`** has a 500 ms StrictMode-replay window: tests that mount the same component twice quickly will both see `isFirstLoad === true`.
- **Audio in unit tests**: `setup.ts` stubs `HTMLMediaElement.prototype.play/pause/load` with Promise-returning mocks. jsdom doesn't decode audio.
