---
name: visual-review
description: The approval checkpoint for anything visible in form-at — design pass, renders or screenshots at phone width copied to ~/Downloads/<topic>/, then stop for the repo owner's ok. Use for any UI, layout, Story or image change before /ship-pr.
---

# Visual review

No PR for visual work until the repo owner has approved the renders.

## 1. Design pass first

Before rendering, check the change against `.claude/rules/design-system-and-styling.md`:
- Tokens only.
- Edges sharp unless it's a tappable content surface.
- Bracket labels never split.
- Labels short enough for 375px.

Fix what fails before taking screenshots.

## 2. Render

- **Pages:** screenshots at **375px** wide (iPhone SE, the narrowest supported).
  Add **412px** (Pixel) and **1280px** when the layout changes. Use Playwright
  against `pnpm dev` from a short script in the scratchpad.
  (`pnpm -C apps/web screenshots` runs a full `vite build` first, so it's slow;
  ask before using it.) Use a
  phone user agent where behaviour differs, and `?story=on` to show the Story
  entry off Android.
- **Stories:**
  - DJ Story image: every treatment (form:at and raw) for **Dzeko**, **Julz Lever** and **Brandon Lee Vear**, which covers a short name, a long one and one that wraps.
  - Story video: frames for sets **003** and **Seafield**.
  - Render through the real renderer, not a mock-up.
- **Measure, never guess.** A colour, size or offset quoted in the summary, or
  written into code (e.g. `APPROVED_INK`), is read from the pixels or the
  computed style.

## 3. Hand over

```bash
mkdir -p ~/Downloads/<topic>
cp <renders> ~/Downloads/<topic>/
```

Give the path and one line per file saying what it shows. Never leave renders
only in the scratchpad: it isn't somewhere the repo owner can find.

## 4. Stop

Wait for approval. Changes requested → back to step 1. Approved → `/handoff`,
then `/ship-pr`, and list the approved renders under "Not verified" as what was
checked instead of a device.
