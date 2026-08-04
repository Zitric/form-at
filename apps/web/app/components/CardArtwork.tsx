import { Image } from "~/components/Image";

/** Fixed sizing/crop for the artwork shown in a Card's `image` slot — the
 *  same everywhere a Card renders one (sets, DJs), so it's a single point
 *  of truth rather than repeated per call site. `originalUrl` is optional —
 *  only set-artwork callers have one to fall back to (see Image.tsx); DJ
 *  photos omit it. */
export function CardArtwork({
  src,
  alt,
  originalUrl,
}: {
  src: string;
  alt: string;
  originalUrl?: string;
}) {
  return (
    <Image
      src={src}
      alt={alt}
      sizes="(min-width: 640px) 112px, 64px"
      className="w-full h-full object-cover"
      originalUrl={originalUrl}
    />
  );
}
