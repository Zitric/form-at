import { Image } from "~/components/Image";

/** Fixed sizing/crop for the artwork shown in a Card's `image` slot — the
 *  same everywhere a Card renders one (sets, DJs), so it's a single point
 *  of truth rather than repeated per call site. */
export function CardArtwork({ src, alt }: { src: string; alt: string }) {
  return (
    <Image
      src={src}
      alt={alt}
      sizes="(min-width: 640px) 112px, 64px"
      className="w-full h-full object-cover"
    />
  );
}
