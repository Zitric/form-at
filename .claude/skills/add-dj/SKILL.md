---
name: add-dj
description: Add a guest or resident DJ to form-at — djs.ts entry, photo through the image pipeline, event lineup, checks and screenshots. Use when asked to add a DJ or put someone on a lineup.
---

# Add a DJ

How Dzeko was added (commits `b4e31d3`, `a1382be`). Branch `feat/dj-<id>`.

## 1. Data

- `packages/data/src/djs.ts`: a new entry following its neighbours. The `id` is
  lowercase-kebab and becomes the URL and the image file name. Socials are
  **handles**, not URLs; the UI builds the links.
- `packages/data/src/events.ts`: add the id to the event's `lineupIds`,
  headline first.

## 2. Photo

The photo is usually in `~/Downloads`.

1. Crop it **square, centred on the face**, and save it as
   `apps/web/images-source/djs/<id>.jpg`. `images-source/` is gitignored apart
   from its README; only the generated variants are committed.
2. Ask first (minutes of compute), then:
   ```bash
   pnpm --filter @form-at/web optimize-images
   pnpm -C apps/web og
   ```
3. `git status` must show exactly four new or changed images:
   `apps/web/public/images/djs/<id>-{640,1080}.{avif,webp}`. Anything else
   regenerated is a side effect: don't commit it, and report it.

## 3. What updates by itself — verify, don't edit

These read `@form-at/data/djs`, so they pick the DJ up without edits. Check each
one shows them:

- The sitemap (`apps/web/scripts/generate-sitemap.ts`, run in the build).
- JSON-LD (`apps/web/app/utils/jsonld.ts`).
- The admin upload/edit `dj_id` dropdown (`UploadSetForm.tsx`, `EditSetForm.tsx`).

## 4. Check and show

- `pnpm check`, `pnpm test`.
- Screenshots at 375px: the DJ page, the DJs list, the event page with the
  lineup (`/visual-review` for where they go).

## 5. After deploy

The repo owner checks the WhatsApp link preview of the DJ page. WhatsApp caches
previews per URL, so share it with `?v=2` (or the next number) to force a fresh
fetch.
