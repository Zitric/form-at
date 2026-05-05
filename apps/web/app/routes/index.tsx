import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <main className="min-h-dvh flex flex-col px-6 py-10">
      <header className="flex items-center gap-3">
        <img src="/logo.png" alt="Form:at" className="w-7 h-7 mix-blend-screen" />
        <span className="text-xs tracking-[0.3em] text-white/30 uppercase">Form:at</span>
      </header>

      <div className="flex-1 flex flex-col justify-center py-16">
        <h1 className="text-[clamp(3.5rem,14vw,11rem)] font-bold leading-none tracking-tighter mb-10">
          FORM:AT
        </h1>

        <div className="space-y-2 text-sm text-white/40 mb-12">
          <p>
            <span className="text-gold mr-2">›</span>system: glasgow techno initiative
          </p>
          <p>
            <span className="text-gold mr-2">›</span>source: analog soul in a digital world
          </p>
          <p>
            <span className="text-gold mr-2">›</span>mission: disconnect to reconnect
          </p>
          <p>
            <span className="text-gold mr-2">›</span>focus: community / music / respect
          </p>
        </div>

        <Link
          to="/sets"
          className="inline-flex items-center gap-4 self-start border border-white/20 px-5 py-3 text-sm text-white/60 hover:border-gold hover:text-gold transition-colors"
        >
          <span className="text-gold">›</span>
          sets_archive
          <span className="text-white/30">[ enter ]</span>
        </Link>
      </div>

      <footer className="text-xs text-white/20">
        [ disconnect_to_reconnect ] █
      </footer>
    </main>
  );
}
