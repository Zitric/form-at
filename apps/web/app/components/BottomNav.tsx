import { NavLinks } from "~/components/NavLinks";
import { usePlayer } from "~/contexts/player-context";

export function BottomNav() {
  const { nowPlaying } = usePlayer();

  return (
    <div
      className="sm:hidden fixed inset-x-0 z-40 bg-navy border-t border-white/10 font-mono"
      style={{
        bottom: nowPlaying ? "48px" : "0px",
        transition: "bottom 300ms ease-in-out",
      }}
    >
      <NavLinks
        className="flex items-center justify-around px-2 py-3"
        itemClassName="flex-1 text-center text-xs text-white/30 hover:text-white/70 transition-colors py-1"
        activeClassName="text-gold"
      />
    </div>
  );
}
