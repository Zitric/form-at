import type { ReactNode } from "react";
import { buildAndroidIntent, isAndroid } from "~/utils/deeplink";

interface SocialLinkProps {
  href: string;
  className?: string;
  /** When present, Android taps are rewritten to an `intent://` URL that opens
   *  the named app (with the web URL embedded as `browser_fallback_url`).
   *  iOS is intentionally left alone — Universal Links already handle the
   *  handoff for major platforms (Instagram, SoundCloud, Spotify, etc.). */
  androidPackage?: string;
  children: ReactNode;
}

/**
 * External link that adapts to the device, **not the viewport size**:
 *
 *  - **Touch-first device** (phone, tablet, `pointer: coarse`): standard
 *    same-tab navigation. iOS Universal Links and Android App Links intercept
 *    and open the native app (Instagram, SoundCloud, etc.) if installed.
 *    `target="_blank"` would break that handoff, so we don't set it.
 *  - **Mouse-first device** (desktop, laptop, `pointer: fine`): a click handler
 *    calls `window.open(href, "_blank")` so the user keeps formatglasgow.com
 *    in their previous tab.
 *
 *  When `androidPackage` is supplied, Android taps route through a Chrome
 *  `intent://` URL instead of the plain web URL — that's the most reliable
 *  way to launch a specific Android app, since App Links require per-app
 *  configuration the user often hasn't enabled.
 *
 * Uses `(pointer: coarse)` instead of viewport width so a desktop user with a
 * narrow window still gets the new-tab behaviour, and a tablet still gets the
 * app handoff regardless of orientation.
 *
 * Modifier-clicks (cmd / ctrl / shift / middle-click) are left alone so power
 * users keep their preferred behaviour.
 */
export function SocialLink({ href, className, androidPackage, children }: SocialLinkProps) {
  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;

    // Android: rewrite to an intent URL so the native app opens directly.
    if (androidPackage && isAndroid()) {
      e.preventDefault();
      window.location.href = buildAndroidIntent(href, androidPackage);
      return;
    }

    // Touch device (iOS, or Android without a package mapping): default
    // same-tab navigation lets Universal Links / App Links do their thing.
    const isTouchPrimary = window.matchMedia("(pointer: coarse)").matches;
    if (isTouchPrimary) return;

    // Desktop: keep formatglasgow.com in the current tab, open the social in a new one.
    e.preventDefault();
    window.open(href, "_blank", "noopener,noreferrer");
  };

  return (
    <a href={href} onClick={onClick} className={className}>
      {children}
    </a>
  );
}
