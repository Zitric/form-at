import type { ReactNode } from "react";

interface SocialLinkProps {
  href: string;
  className?: string;
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
 * Uses `(pointer: coarse)` instead of viewport width so a desktop user with a
 * narrow window still gets the new-tab behaviour, and a tablet still gets the
 * app handoff regardless of orientation.
 *
 * Modifier-clicks (cmd / ctrl / shift / middle-click) are left alone so power
 * users keep their preferred behaviour.
 */
export function SocialLink({ href, className, children }: SocialLinkProps) {
  const onClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    const isTouchPrimary = window.matchMedia("(pointer: coarse)").matches;
    if (!isTouchPrimary) {
      e.preventDefault();
      window.open(href, "_blank", "noopener,noreferrer");
    }
  };
  return (
    <a href={href} onClick={onClick} className={className}>
      {children}
    </a>
  );
}
