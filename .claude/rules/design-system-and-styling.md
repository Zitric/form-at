---
paths:
  - "packages/ui/**"
  - "apps/*/app/**/*.tsx"
  - "apps/*/app/**/*.css"
---

# Design system, styling and JSX

The design system lives in `packages/ui/src/` — one folder per component, `icons/`
flat. README → *"Monorepo structure"* (late extraction, no build step).

## Never remove the `@source` directive from `apps/web/app/styles/global.css`

Tailwind v4's automatic source scanning excludes `node_modules`, and
`packages/ui` reaches `apps/web` only through a pnpm workspace symlink. Without
`@source "../../../../packages/ui/src";` Tailwind never sees class names used
inside the design system and **silently strips them from the bundle** — the
components render unstyled, with no build error.

## Keep the tokens pair in step

`packages/ui/src/tokens.css` ↔ `packages/ui/src/tokens.ts` (the JS colour mirror
for canvas use). `tokens.test.ts` parses both and asserts they match, so this one
fails loudly — but fix both, don't weaken the test. (The other pair, `WIDTHS`,
is in `data-r2-d1.md`.)

## Never hand-roll a `[ label ]` bracket button

Use `<Button variant="secondary">label</Button>`, or `BracketLabel` on non-button
surfaces (`Link`, `<a>`, Toast, NavLinks). The design system owns the bracket
colouring, and `BracketLabel` owns its own `whitespace-nowrap`.

**Bracket labels never wrap mid-bracket.** An orphaned `]` on the next line reads
as a layout bug. `BracketLabel` owns `whitespace-nowrap` so this is structural
rather than a per-caller convention — that's deliberate, because it bit three
times before the fix moved into the component (a banner `[ × ]`, a
`[ share_set ]` / `[ save_for_offline ]` row, and a missed case in
`AddToCalendarButton`). If nowrap forces overflow at 375px (iPhone SE is the test
case), **shorten the label** — never let the bracket split.

## Styling

- Tailwind utilities only — no inline `style` except genuinely dynamic values (animation offsets).
- Tokens: `packages/ui/src/tokens.css` (Tailwind `@theme`, keyframes, `t-*` typography) and `packages/ui/src/tokens.ts` (JS mirror for canvas, e.g. `Waveform.tsx`).
- Brand colours: `bg-black` `#161615`, `text-gold` `#c58538`, `text-purple` `#43437a`, `text-grey` `#cbcbcb`, `font-mono` Space Mono.
- **Edges — sharp by default.** Terminal rows, player bar, headers, status pills, CTA buttons and structural borders stay square. `rounded-card` (the single `--radius-card: 4px` token in `packages/ui/src/tokens.css`) is only for content surfaces the user taps into: list cards, artwork, flyers. `rounded-full` only for genuinely circular elements. **Never** the freeform scale (`rounded-md`/`lg`/`xl`).

## Where code lives

- Extract a component when the same UI or behaviour appears twice, or when a file gets hard to scan.
- **Generic, presentational, framework-agnostic → `packages/ui/src/`.** Anything Zustand-coupled, TanStack-Router-coupled, or tied to an app convention (e.g. the R2 image URL scheme) stays in `apps/web/app/components/`.
- Name components for what they *are*, not where they're used (`TrackRow`, not `SetsPageTrackRow`).
- Keep props minimal and typed. Explicit prop interfaces over spreading unknown objects.
- Route files own their loader, server functions and component. Extract past ~150 lines or on second use.
- Custom hooks in `apps/web/app/hooks/`.
- File names: `kebab-case` for routes and utilities, `PascalCase` for components.
- When the choice is a quick inline fix versus a properly placed one in a shared package, take the latter and expect it to be tested and documented (Storybook story + interaction coverage for anything in `packages/ui`, not just "it renders").

## Readable JSX

JSX describes **what** the UI is, not **how** it's computed. Hoist anything that
needs a mental parser:
- **Nested ternaries → named consts** above the `return`. Name for the value produced (`playButtonLabel`), not the condition (`isPlayingAndLoaded`).
- **Inline math / string-building → named const or util.** A one-off `Math.floor(t/60)` is fine; a repeated `M:SS` formatter belongs in `~/utils/fmt.ts`. Reach for the util the second time.
- **Conditional fragments and conditional callback args → named consts**, so the handler reads as the verb it is.
- **Threshold:** no value in the markup should take more than ~5 seconds to understand.

## Two editing traps in `packages/ui`

- **Don't mix `vi.fn()` with Storybook's `fn()`.** `storybook/test`'s `fn()` bundles its own `@vitest/spy` — a structurally different `Mock` type from the workspace's `vitest` — so passing a local `vi.fn()` as a prop override on a composed story fails `tsc` confusingly. Assert against the mock the story already made: `composeStories(stories).Secondary.args.onClick`.
- Interaction tests run stories through plain Vitest + jsdom via `composeStories`, **not** the Storybook test-runner or `addon-vitest` — both need a real browser, and a second browser-install surface is an avoidable failure mode in this repo (see the Playwright cache rule in `ci.md`).
