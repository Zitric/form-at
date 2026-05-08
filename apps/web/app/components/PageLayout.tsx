import type { ReactNode } from "react";
import { cn } from "~/utils/cn";
import { useRouteTransition } from "~/hooks/useRouteTransition";
import { Header } from "~/components/Header";
import { Muted } from "~/components/Text";

interface PageLayoutProps {
  children: ReactNode;
  footer: string;
}

export function PageLayout({ children, footer }: PageLayoutProps) {
  const isVisible = useRouteTransition();

  return (
    <main
      className={cn(
        "min-h-dvh flex flex-col px-6 pt-10 pb-36 sm:pb-24 font-mono max-w-2xl mx-auto w-full transition-opacity-smooth",
        !isVisible && "opacity-0",
      )}
      suppressHydrationWarning
    >
      <Header />
      {children}
      {/* <footer className="mt-12">
        <Muted>{footer} █</Muted>
      </footer> */}
    </main>
  );
}
