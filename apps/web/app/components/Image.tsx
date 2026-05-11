// Keep WIDTHS in sync with apps/web/scripts/optimize-images.mjs. We deliberately
// cap at 1080 because some source images (DJ portraits) don't reach 1920px wide
// — the optimizer doesn't upscale, so requesting a 1920 variant would 404 on
// those and Firefox doesn't fall back to the <img src> default reliably. 1080
// covers every realistic display: 4K desktop with DPR=2 at our largest layout
// (~672px) still renders cleanly.
const WIDTHS = [640, 1080] as const;

type ImageProps = {
  /**
   * Base path under `/images/`, no size or extension.
   * e.g. `"djs/julz-lever"` resolves to `/images/djs/julz-lever-{640,1080,1920}.{avif,webp}`
   */
  src: string;
  alt: string;
  /**
   * Viewport-to-rendered-width mapping the browser uses to pick a variant.
   *
   * - Full-width hero:           `"100vw"`
   * - Half-width card on tablet+: `"(min-width: 640px) 50vw, 100vw"`
   * - Fixed avatar:               `"64px"`
   */
  sizes: string;
  className?: string;
  /** Skip lazy-loading and decode synchronously — use for above-the-fold images. */
  priority?: boolean;
  /** Reserve layout space (recommended) — pass the source's intrinsic aspect-ratio dimensions. */
  width?: number;
  height?: number;
};

const buildSrcSet = (src: string, ext: "avif" | "webp") =>
  WIDTHS.map((w) => `/images/${src}-${w}.${ext} ${w}w`).join(", ");

export function Image({ src, alt, sizes, className, priority = false, width, height }: ImageProps) {
  return (
    <picture>
      <source type="image/avif" srcSet={buildSrcSet(src, "avif")} sizes={sizes} />
      <source type="image/webp" srcSet={buildSrcSet(src, "webp")} sizes={sizes} />
      <img
        src={`/images/${src}-1080.webp`}
        alt={alt}
        className={className}
        loading={priority ? "eager" : "lazy"}
        decoding={priority ? "sync" : "async"}
        fetchPriority={priority ? "high" : undefined}
        width={width}
        height={height}
      />
    </picture>
  );
}
