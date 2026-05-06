import type { ReactNode } from "react";
import { Header } from "~/components/Header";
import { Muted } from "~/components/Text";

interface PageLayoutProps {
  children: ReactNode;
  footer: string;
}

export function PageLayout({ children, footer }: PageLayoutProps) {
  return (
    <main className="min-h-dvh flex flex-col px-6 pt-10 pb-24 font-mono max-w-2xl mx-auto w-full">
      <Header />
      {children}
      <footer className="mt-12">
        <Muted>{footer} █</Muted>
      </footer>
    </main>
  );
}
