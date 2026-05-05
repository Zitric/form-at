import { Link } from "@tanstack/react-router";

export function Header() {
  return (
    <header className="flex items-center gap-3 mb-12">
      <Link to="/" className="flex items-center gap-3 group">
        <img src="/logo.png" alt="Form:at" className="w-7 h-7 mix-blend-screen" />
        <span className="text-xs tracking-[0.3em] text-white/30 group-hover:text-white/60 uppercase transition-colors">
          Form:at
        </span>
      </Link>
    </header>
  );
}
