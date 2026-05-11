// Build the per-route meta tags that override the root <head> defaults.
// Keep title/description/og:url/twitter:* in sync; social platforms read from
// these to render the share card. og:image stays the global banner so the
// brand is consistent across every share.

const SITE = "https://formatglasgow.com";

export function pageHead({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}) {
  const url = `${SITE}${path}`;
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:url", content: url },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
    ],
  };
}
