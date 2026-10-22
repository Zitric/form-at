# Change summary template

The repo owner pastes this, or the PR link, into another chat, so it has to stand
alone. Plain words; no "as discussed".

```markdown
## What changed
- `path/to/file.ts` — what changed, and why, in one line.
- …

## Checks
- Ran: `pnpm check` ✓, `pnpm test` ✓ (N files), …
- Not run: `pnpm test:e2e` (why), `pnpm build` (why) …

## Not verified
- On a device (Pixel / installed PWA), on iOS (no iPhone: goes on the iPhone list in TECH_DEBT/IMPROVEMENTS), in production — whichever apply, and what was checked instead.

## Complex parts
For each tricky piece — a guard, an edge case, a non-obvious algorithm:

**<name>** (`file.ts:123`)
EN: what it does and why it has to be that way, in plain words.
ES: lo mismo, en español.

## Needs from you
- Anything to run (Cloudflare writes, a device check), approve or decide. "Nothing" if nothing.
```

The PR body (`/ship-pr`) reuses "What changed" and "Complex parts" in English only.
