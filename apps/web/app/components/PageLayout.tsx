import type { ReactNode } from "react";
import { useRouteTransition } from "~/hooks/useRouteTransition";
import { cn } from "~/utils/cn";

interface PageLayoutProps {
  children: ReactNode;
}

export function PageLayout({ children }: PageLayoutProps) {
  const isVisible = useRouteTransition();

  return (
    <main
      className={cn(
        // px-6 only kicks in below md: (768px). Above that, the viewport is
        // wide enough that max-w-2xl (672px) + mx-auto already provides the
        // visual breathing room, and any inner padding is invisible against
        // the existing outer centring gap. Cleaner semantic: pad only when
        // the container hasn't reached its max-width.
        //
        // pb-40 (160px) clears the fixed bottom chrome on both surfaces:
        //   - mobile: BottomNav (55) + MobileMiniPlayer (56) + iOS safe-area
        //     (~34 worst case) ≈ 145px → ~15px breathing
        //   - desktop: two-row DesktopPlayer (~120px) → ~40px breathing
        // Unified value because the two are now close in height; tracking
        // each surface's exact chrome would add responsive complexity for a
        // ~16px difference no one will notice.
        "flex flex-col px-6 md:px-0 pb-40 font-mono max-w-2xl mx-auto w-full transition-opacity-smooth animate-fade-in",
        !isVisible && "opacity-0",
      )}
      suppressHydrationWarning
    >
      {children}
    </main>
  );
}
