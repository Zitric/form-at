import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <main className="max-w-2xl mx-auto px-6 py-20">
      <h1 className="text-5xl font-bold tracking-tight">Form:at</h1>
      <p className="text-white/50 mt-3 text-lg">Techno collective · Glasgow</p>
      <Link
        to="/sets"
        className="inline-block mt-10 border border-white px-8 py-3 text-sm uppercase tracking-widest hover:bg-white hover:text-[#0a0a0a] transition-colors"
      >
        Listen
      </Link>
    </main>
  );
}
