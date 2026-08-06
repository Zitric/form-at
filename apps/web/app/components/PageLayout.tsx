import { cn } from "@form-at/ui";
import type { ReactNode } from "react";
import { useRouteTransition } from "~/hooks/useRouteTransition";

interface PageLayoutProps {
  children: ReactNode;
}

export function PageLayout({ children }: PageLayoutProps) {
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
        // exactly would add responsive complexity for ~16px nobody notices.
        //
        // `flex-1` participates in the app-wide sticky-footer layout (body is
        // `min-h-dvh flex flex-col`, see __root.tsx): this <main> claims the
        // viewport-minus-header slice handed down, so inner `flex-1`s resolve
        // to real space instead of a no-op.
        "flex-1 flex flex-col px-6 md:px-0 pb-40 font-mono max-w-2xl mx-auto w-full transition-opacity-smooth animate-fade-in",
        !isVisible && "opacity-0",
      )}
      suppressHydrationWarning
    >
      {children}
    </main>
  );
}
