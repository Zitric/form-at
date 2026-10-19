import { cn } from "@form-at/ui";
import type { ReactNode } from "react";
import { useRouteTransition } from "~/hooks/useRouteTransition";

interface PageLayoutProps {
  children: ReactNode;
  /** Phones: clear exactly the fixed chrome (--fit-pb, global.css) instead
   *  of pb-40, so a page sized to fit the screen doesn't scroll. Home only:
   *  other pages scroll anyway and keep the roomier default. */
  fitBottom?: boolean;
}

export function PageLayout({ children, fitBottom = false }: PageLayoutProps) {
  const isVisible = useRouteTransition();

  return (
    <main
      className={cn(
        // px-6 only below md: above that, max-w-2xl + mx-auto already provides
        // the breathing room and inner padding is invisible against the
        // centring gap. Pad only when the container hasn't hit its max-width.
        //
        // pb-40 (160px) clears the fixed bottom chrome: mobile BottomNav (55) +
        // MobileMiniPlayer (56) + iOS safe-area (~34) ≈ 145px; desktop's
        // two-row player ≈ 120px. One unified value — tracking each surface
        // exactly would add responsive complexity for ~16px nobody notices,
        // except on home (fitBottom), which is sized to fit the screen: pb-40
        // over-reserves ~50px on Android, where the inset is 0, which would
        // make a page sized to the screen scroll.
        //
        // `flex-1` participates in the app-wide sticky-footer layout (body is
        // `min-h-dvh flex flex-col`, see __root.tsx): this <main> claims the
        // viewport-minus-header slice handed down, so inner `flex-1`s resolve
        // to real space instead of a no-op.
        "flex-1 flex flex-col px-6 md:px-0 font-mono max-w-2xl mx-auto w-full transition-opacity-smooth animate-fade-in",
        fitBottom ? "pb-(--fit-pb) sm:pb-40" : "pb-40",
        !isVisible && "opacity-0",
      )}
      suppressHydrationWarning
    >
      {children}
    </main>
  );
}
