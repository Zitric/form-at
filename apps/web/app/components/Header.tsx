import { Link } from "@tanstack/react-router";
import { NavLinks } from "~/components/NavLinks";

export function Header() {
  return (
    <header className="flex items-center justify-center -mx-6 px-6 mb-12 sm:mx-0 sm:px-0 sm:justify-between">
      <Link
        to="/"
        className="opacity-60 hover:opacity-100 transition-opacity shrink-0 pl-16 sm:pl-0"
      >
        <div className="overflow-hidden w-[280px] h-[40px] sm:w-[310px] sm:h-[44px] bg-black">
          <img
            src="/wordmark.png"
            alt="Form:at"
            fetchPriority="high"
            decoding="sync"
            className="w-[430px] sm:w-[475px] -translate-x-[17.32%] -translate-y-[45.6%] mix-blend-screen"
          />
        </div>
      </Link>

      <NavLinks
        className="hidden sm:flex items-center gap-6"
        itemClassName="text-xs text-grey hover:text-white transition-colors tracking-widest uppercase"
        activeClassName="text-gold"
      />
    </header>
  );
}
