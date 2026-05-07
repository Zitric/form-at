import { NavLinks } from "~/components/NavLinks";
import { useStore } from "~/store";

export function BottomNav() {
  const nowPlaying = useStore((s) => s.nowPlaying);

  return (
    <div
      className="sm:hidden fixed inset-x-0 z-40 bg-black border-t border-white/10 font-mono"
      style={{
        bottom: nowPlaying ? "52px" : "0px",
        transition: "bottom 300ms ease-in-out",
      }}
    >
      <NavLinks
        className="flex items-center justify-around px-2 py-3"
        itemClassName="flex-1 text-center text-xs text-grey hover:text-white transition-colors py-1"
        activeClassName="text-gold"
      />
    </div>
  );
}
