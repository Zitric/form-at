import { NavLinks } from "~/components/NavLinks";
import { useFirstLoad } from "~/hooks/useFirstLoad";
import { LAYOUT } from "~/styles/layout";
import { Z } from "~/styles/z";

export function BottomNav() {
  const isFirstLoad = useFirstLoad();

  return (
    <div
      className={`sm:hidden fixed bottom-0 inset-x-0 ${Z.bottomNav} bg-black border-t border-white/10 font-mono pb-[env(safe-area-inset-bottom)]`}
      style={{
        height: `calc(${LAYOUT.navHeightMobile}px + env(safe-area-inset-bottom))`,
        animation: isFirstLoad ? "fade-in 0.8s ease-out" : undefined,
      }}
      suppressHydrationWarning
    >
      <NavLinks
        className="flex items-center justify-around px-2 py-3"
        itemClassName="flex-1 text-center text-xs text-grey hover:text-white transition-colors py-1"
        activeClassName="text-gold"
      />
    </div>
  );
}
