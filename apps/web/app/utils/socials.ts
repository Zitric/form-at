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
  | "youtube"
  | "linktree"
  | "website";

type SocialAdapter = {
  /** Short label used inside the [ … ] chip. */
  label: string;
  /** Build the public URL from the stored handle (or pass through if already a URL). */
  toUrl: (handle: string) => string;
  /** Android package name. When present, taps on this link are routed via an
   *  `intent://` URL on Android so the native app opens (with the web URL as a
   *  graceful fallback). iOS handles the same handoff transparently via
   *  Universal Links — no per-platform config needed there. */
  androidPackage?: string;
};

const isUrl = (s: string) => /^https?:\/\//.test(s);
const wrap = (h: string, build: () => string) => (isUrl(h) ? h : build());

export const SOCIALS: Record<SocialKey, SocialAdapter> = {
  instagram: {
    label: "instagram",
    toUrl: (h) => wrap(h, () => `https://instagram.com/${h}`),
    androidPackage: "com.instagram.android",
  },
  soundcloud: {
    label: "soundcloud",
    toUrl: (h) => wrap(h, () => `https://soundcloud.com/${h}`),
    androidPackage: "com.soundcloud.android",
  },
  mixcloud: {
    label: "mixcloud",
    toUrl: (h) => wrap(h, () => `https://mixcloud.com/${h}`),
    androidPackage: "com.mixcloud.player",
  },
  facebook: {
    label: "facebook",
    toUrl: (h) => wrap(h, () => `https://facebook.com/${h}`),
    androidPackage: "com.facebook.katana",
  },
  residentadvisor: {
    label: "ra",
    toUrl: (h) => wrap(h, () => `https://ra.co/dj/${h}`),
    androidPackage: "com.residentadvisor.ra",
  },
  bandcamp: {
    label: "bandcamp",
    toUrl: (h) => wrap(h, () => `https://${h}.bandcamp.com`),
    androidPackage: "com.bandcamp.android",
  },
  spotify: {
    label: "spotify",
    toUrl: (h) => wrap(h, () => `https://open.spotify.com/artist/${h}`),
    androidPackage: "com.spotify.music",
  },
  youtube: {
    // Handles are stored WITH their leading `@` (e.g. "@Iona.Violet"), because
    // that's what makes youtube.com/@handle resolve. A bare name without it
    // hits a legacy /user path that 404s for modern channels.
    label: "youtube",
    toUrl: (h) => wrap(h, () => `https://youtube.com/${h}`),
    androidPackage: "com.google.android.youtube",
  },
  linktree: {
    label: "linktree",
    toUrl: (h) => wrap(h, () => `https://linktr.ee/${h}`),
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
  "youtube",
  "residentadvisor",
  "facebook",
  "linktree",
  "website",
];
