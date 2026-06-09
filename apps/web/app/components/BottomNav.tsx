import { NavLinks } from "~/components/NavLinks";
import { useFirstLoad } from "~/hooks/useFirstLoad";
import { useStore } from "~/store";
import { Z } from "~/styles/z";

export function BottomNav() {
  const isFirstLoad = useFirstLoad();
  const nowPlaying = useStore((s) => s.nowPlaying);

  return (
    <div
      className={`sm:hidden fixed inset-x-0 ${Z.bottomNav} bg-black border-t border-white/10 font-mono h-[55px]`}
      style={{
        bottom: nowPlaying ? "78px" : "0px",
        transition: "bottom 300ms ease-in-out",
        animation: isFirstLoad ? "fade-in 5s ease-out" : undefined,
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
