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
        "flex flex-col px-6 md:px-0 pb-36 sm:pb-24 font-mono max-w-2xl mx-auto w-full transition-opacity-smooth animate-fade-in",
        !isVisible && "opacity-0",
      )}
      suppressHydrationWarning
    >
      {children}
    </main>
  );
}
