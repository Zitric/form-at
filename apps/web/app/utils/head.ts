// Build the per-route meta tags that override the root <head> defaults.
// Keep title/description/og:url/twitter:* in sync; social platforms read from
// these to render the share card. Pass `image` (path under public/) to use a
// custom OG banner — otherwise the root default (`/og-image.png`) is reused.
// Pass `noindex` for pages that should never appear in search results (e.g.
// the admin dashboard) — same `content="noindex"` value already used by
// `public/offline.html`.

const SITE = "https://formatglasgow.com";

export function pageHead({
  title,
  description,
  path,
  image,
  noindex,
}: {
  title: string;
  description: string;
  path: string;
  image?: string;
  noindex?: boolean;
}) {
  const url = `${SITE}${path}`;
  const imageMeta = image
    ? [
        { property: "og:image", content: `${SITE}${image}` },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { name: "twitter:image", content: `${SITE}${image}` },
      ]
    : [];
  return {
    meta: [
      ...(noindex ? [{ name: "robots", content: "noindex" }] : []),
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:url", content: url },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      ...imageMeta,
    ],
    // Canonical helps search engines deduplicate (e.g. trailing-slash or
    // case variants resolve to the same page) and tells AI crawlers which
    // URL to cite when answering questions about this content.
    links: [{ rel: "canonical", href: url }],
  };
}
