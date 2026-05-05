import { Link, createFileRoute } from "@tanstack/react-router";
import { Header } from "~/components/Header";

export const Route = createFileRoute("/$")({
  component: NotFound,
});

function NotFound() {
  return (
    <main className="min-h-dvh flex flex-col px-6 py-10 font-mono max-w-2xl mx-auto w-full">
      <Header />

      <div className="flex-1 flex flex-col justify-center">
        <p className="text-xs text-white/30 mb-4">
          <span className="text-gold mr-2">›</span>status: [ 404 ]
        </p>
        <h1 className="text-5xl sm:text-7xl font-bold leading-none tracking-tighter mb-6">
          SIGNAL_LOST
        </h1>
        <p className="text-sm text-white/40 mb-10 border-l border-white/10 pl-4 max-w-sm">
          transmission not found — this frequency doesn't exist
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-4 self-start border border-white/20 px-5 py-3 text-sm text-white/60 hover:border-gold hover:text-gold transition-colors"
        >
          <span className="text-gold">›</span>
          return_to_base
        </Link>
      </div>

      <footer className="mt-12 text-xs text-white/20">[ end_of_transmission ] █</footer>
    </main>
  );
}
