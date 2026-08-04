import { useEffect, useRef, useState } from "react";

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
  /**
   * As-uploaded original to fall back to (a plain `<img>`, no responsive
   * variants) if the optimized `<picture>` fails to load — real today for a
   * set uploaded via the admin panel, which has no optimized AVIF/WebP
   * variants until `optimize-images.mjs` learns to generate them (PR5).
   * Omit when there's nothing to fall back to (DJ photos, event flyers,
   * legacy sets whose variants are already committed) — a failure then
   * renders nothing rather than a broken image.
   */
  originalUrl?: string;
};

const buildSrcSet = (src: string, ext: "avif" | "webp") =>
  WIDTHS.map((w) => `/images/${src}-${w}.${ext} ${w}w`).join(", ");

export function Image({
  src,
  alt,
  sizes,
  className,
  priority = false,
  width,
  height,
  originalUrl,
}: ImageProps) {
  // Per <picture> semantics, a matching <source> governs the <img>'s
  // resolved URL for as long as it stays in the DOM — mutating the <img>'s
  // `src` directly is a no-op while a sibling <source> still matches.
  // React state controlling which element tree renders (this flag) is the
  // actual fix: on failure the whole <picture>/<source> subtree is replaced
  // by a bare <img>, not patched in place.
  const [optimizedFailed, setOptimizedFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // This component doesn't remount when `src` changes — FullPlayer renders
  // one <Image> against `nowPlaying.artwork`, which changes as the user
  // moves between tracks while the component instance (and its state)
  // survives. Without this, a single failed image would poison every
  // later, perfectly-fine `src` shown in that same slot for the rest of the
  // session (confirmed by reproducing it: render, fail, re-render with a
  // different src, the fallback stays stuck). Comparing against the
  // previous `src` during render — not inside an effect — is React's own
  // documented pattern for resetting state when a prop changes without
  // forcing a remount; it re-renders with the reset value before ever
  // committing the stale one to the DOM.
  const [prevSrc, setPrevSrc] = useState(src);
  if (src !== prevSrc) {
    setPrevSrc(src);
    setOptimizedFailed(false);
  }

  // This app SSRs (see app/server.ts) — the optimized <img src> ships in the
  // server-rendered HTML, so the browser can start (and finish failing)
  // that request before React ever hydrates and attaches `onError` on this
  // element (`error`/`load` don't bubble, so React can only catch them via
  // a listener on the element itself, wired up at hydration). A failure
  // that resolves in that window fires into the void — no listener was
  // there yet, and it won't fire again on its own. `.complete` true with
  // `.naturalWidth === 0` is the standard signal for exactly that "already
  // failed, no error event coming" case; checked once on mount as a
  // deliberately unconditional backstop alongside the normal `onError`
  // handler below, not because the race is provably common on any given
  // load.
  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth === 0) setOptimizedFailed(true);
  }, []);

  if (optimizedFailed) {
    if (!originalUrl) return null;
    return (
      <img
        src={originalUrl}
        alt={alt}
        className={className}
        loading={priority ? "eager" : "lazy"}
        decoding={priority ? "sync" : "async"}
        fetchPriority={priority ? "high" : undefined}
        width={width}
        height={height}
      />
    );
  }

  return (
    <picture>
      <source type="image/avif" srcSet={buildSrcSet(src, "avif")} sizes={sizes} />
      <source type="image/webp" srcSet={buildSrcSet(src, "webp")} sizes={sizes} />
      <img
        ref={imgRef}
        src={`/images/${src}-1080.webp`}
        alt={alt}
        className={className}
        loading={priority ? "eager" : "lazy"}
        decoding={priority ? "sync" : "async"}
        fetchPriority={priority ? "high" : undefined}
        width={width}
        height={height}
        onError={() => setOptimizedFailed(true)}
      />
    </picture>
  );
}
