# images-source

Drop heavy originals here (JPEG, PNG, TIFF — straight from the camera is fine).
**The images in this folder are gitignored**; the optimized output goes to
`../public/images/` and *is* committed. This README is the one tracked file in
here, so the workflow stays discoverable in a fresh clone.

## Workflow

```bash
# 1. Drop your image(s) into this folder, e.g.:
#    apps/web/images-source/events/002.jpg
#    apps/web/images-source/djs/julz-lever.jpg

# 2. Run from anywhere in the repo:
pnpm --filter @form-at/web optimize-images

# 3. The script writes to apps/web/public/images/, mirroring the source
#    folder structure — two widths × two formats per source image:
#    apps/web/public/images/events/002-{640,1080}.{avif,webp}
#    apps/web/public/images/djs/julz-lever-{640,1080}.{avif,webp}
```

Re-runs only re-process files whose source is newer than its output. Use
`--force` to regenerate everything.

**Widths are 640 and 1080 — there is no 1920 variant.** The cap is deliberate:
some sources (DJ portraits) aren't 1920px wide, the optimizer never upscales,
and a requested-but-missing variant 404s without Firefox reliably falling back
to the `<img src>`. 1080 covers a 4K desktop at DPR 2 for our widest layout
(~672px). The list lives in `WIDTHS` in `../scripts/optimize-images.ts` and is
mirrored in `../app/components/Image.tsx` — **change both together or the
srcset requests files that were never generated.**

## Using the output in components

Don't hand-write a `<picture>` block. `~/components/Image` owns the whole
srcset/format-fallback dance, and takes the base path with **no width and no
extension** — the same string the data layer stores:

```tsx
<Image
  src="djs/julz-lever"
  alt="Julz Lever"
  sizes="(min-width: 768px) 672px, 100vw"
  className="w-full aspect-square object-cover"
/>
```

It resolves `/images/djs/julz-lever-{640,1080}.{avif,webp}`, prefers AVIF, and
falls back to WebP. AVIF is roughly 30% smaller than WebP, which is roughly
30% smaller than JPEG.
