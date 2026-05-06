import { Link } from "@tanstack/react-router";
import { NavLinks } from "~/components/NavLinks";

export function Header() {
  return (
    <header className="flex items-center justify-center sm:justify-between mb-12">
      <Link to="/" className="opacity-60 hover:opacity-100 transition-opacity shrink-0">
        <div className="overflow-hidden w-[310px] h-[44px] bg-navy">
          <img
            src="/wordmark.png"
            alt="Form:at"
            className="w-[475px] -translate-x-[17.32%] -translate-y-[45.6%] mix-blend-screen"
          />
        </div>
      </Link>

      <NavLinks
        className="hidden sm:flex items-center gap-6"
        itemClassName="text-xs text-white/30 hover:text-white/70 transition-colors tracking-widest uppercase"
        activeClassName="text-gold"
      />
    </header>
  );
}
