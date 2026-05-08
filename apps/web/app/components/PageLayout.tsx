import type { ReactNode } from "react";
import { useRouteTransition } from "~/hooks/useRouteTransition";
import { cn } from "~/utils/cn";

interface PageLayoutProps {
  children: ReactNode;
  footer: string;
}

export function PageLayout({ children, footer }: PageLayoutProps) {
  const isVisible = useRouteTransition();

  return (
    <main
      className={cn(
        "flex flex-col px-6 pb-36 sm:pb-24 font-mono max-w-2xl mx-auto w-full transition-opacity-smooth",
        !isVisible && "opacity-0",
      )}
      suppressHydrationWarning
    >
      {children}
    </main>
  );
}
