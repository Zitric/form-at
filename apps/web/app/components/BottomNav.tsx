import { NavLinks } from "~/components/NavLinks";
import { useFirstLoad } from "~/hooks/useFirstLoad";
import { useStore } from "~/store";
import { cn } from "~/utils/cn";

export function BottomNav() {
  const isFirstLoad = useFirstLoad();
  const nowPlaying = useStore((s) => s.nowPlaying);

  return (
    <div
      className={cn(
        "sm:hidden fixed inset-x-0 z-40 bg-black border-t border-white/10 font-mono",
        isFirstLoad && "animate-slow-fade-in",
      )}
      style={{
        bottom: nowPlaying ? "52px" : "0px",
        transition: "bottom 300ms ease-in-out",
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
