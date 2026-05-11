/**
 * Per-platform URL builders. Data stores either:
 *  - the bare handle/slug (e.g. "julz-lever") — we wrap it with the canonical host
 *  - or the full URL (e.g. "https://soundcloud.com/julz-lever") — we pass it through
 *
 * Adding a new platform here automatically lights it up wherever socials render.
 */

export type SocialKey =
  | "instagram"
  | "soundcloud"
  | "mixcloud"
  | "facebook"
  | "residentadvisor"
  | "bandcamp"
  | "spotify"
  | "website";

type SocialAdapter = {
  /** Short label used inside the [ … ] chip. */
  label: string;
  /** Build the public URL from the stored handle (or pass through if already a URL). */
  toUrl: (handle: string) => string;
};

const isUrl = (s: string) => /^https?:\/\//.test(s);
const wrap = (h: string, build: () => string) => (isUrl(h) ? h : build());

export const SOCIALS: Record<SocialKey, SocialAdapter> = {
  instagram: {
    label: "instagram",
    toUrl: (h) => wrap(h, () => `https://instagram.com/${h}`),
  },
  soundcloud: {
    label: "soundcloud",
    toUrl: (h) => wrap(h, () => `https://soundcloud.com/${h}`),
  },
  mixcloud: {
    label: "mixcloud",
    toUrl: (h) => wrap(h, () => `https://mixcloud.com/${h}`),
  },
  facebook: {
    label: "facebook",
    toUrl: (h) => wrap(h, () => `https://facebook.com/${h}`),
  },
  residentadvisor: {
    label: "ra",
    toUrl: (h) => wrap(h, () => `https://ra.co/dj/${h}`),
  },
  bandcamp: {
    label: "bandcamp",
    toUrl: (h) => wrap(h, () => `https://${h}.bandcamp.com`),
  },
  spotify: {
    label: "spotify",
    toUrl: (h) => wrap(h, () => `https://open.spotify.com/artist/${h}`),
  },
  website: {
    label: "web",
    toUrl: (h) => (isUrl(h) ? h : `https://${h}`),
  },
};

// Render order — stable across DJs regardless of the order in `data/djs.ts`.
export const SOCIAL_ORDER: SocialKey[] = [
  "instagram",
  "soundcloud",
  "mixcloud",
  "bandcamp",
  "spotify",
  "residentadvisor",
  "facebook",
  "website",
];
