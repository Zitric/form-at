import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { NavLinks } from "~/components/NavLinks";

export function Header() {
  // Opacity-transition fade-in (vs. the previous keyframe animation) so the
  // header never appears-then-disappears-then-fades on first paint. See the
  // matching note in BottomNav for the full diagnosis. Lives in __root.tsx,
  // mounts once per page load.
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(true);
  }, []);

  return (
    <header
      className="flex items-center justify-center px-6 md:px-0 pt-10 mb-8 sm:pt-10 sm:mb-12 sm:justify-between max-w-2xl mx-auto w-full"
      style={{ opacity: visible ? 1 : 0, transition: "opacity 5s ease-out" }}
      suppressHydrationWarning
    >
      <Link to="/" className="hover:opacity-70 transition-opacity shrink-0 pl-18 sm:pl-0">
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
