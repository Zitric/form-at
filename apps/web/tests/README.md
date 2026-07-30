# Tests

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
│   ├── store/         # Zustand slices (loadTrack, playTrack, togglePlay…)
│   ├── hooks/         # useFirstLoad and friends
│   ├── components/    # BookingsButton, PlayerIcons, etc. (shared design-system
│   │                  #   components live in packages/ui and are tested there)
│   └── utils/         # fmtDuration, fmtDate
├── e2e/
│   ├── home.spec.ts        # Manifesto, CTA, social links
│   ├── sets.spec.ts        # List + info → detail flow
│   ├── events.spec.ts      # List + lineup links
│   ├── djs.spec.ts         # Residents/guests sections
│   ├── player.spec.ts      # Audio + controls (mocks R2 with silent MP3)
│   └── navigation.spec.ts  # Top/bottom nav routing
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

- **Playwright runs `workers: 1`** locally — Vite's dev server races on parallel route loads. CI keeps the same setting.
- **`useFirstLoad`** has a 500 ms StrictMode-replay window: tests that mount the same component twice quickly will both see `isFirstLoad === true`.
- **Audio in unit tests**: `setup.ts` stubs `HTMLMediaElement.prototype.play/pause/load` with Promise-returning mocks. jsdom doesn't decode audio.
