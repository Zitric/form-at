import { useEffect, useState } from "react";
import { BracketLabel } from "~/components/BracketLabel";
import { useStore } from "~/store";
import { Z } from "~/styles/z";

const VISIBLE_MS = 1700;
const EXIT_MS = 250;

// Lightweight transient message above the player/nav. Used by share buttons and
// anything else that needs a "copied / saved / done" confirmation. Slides up on
// enter, slides down on exit; auto-fades after VISIBLE_MS. The whole surface
// is click-to-dismiss (the `[ x ]` on the right is a visual affordance, not a
// separate button) so a user can clear it before the auto-timer fires. Message
// text runs plain; brackets live only on the `x` per the design-system rules.
export function Toast() {
  const toast = useStore((s) => s.toast);
  const setToast = useStore((s) => s.setToast);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    if (!toast) return;
    setExiting(false);
    const id = window.setTimeout(() => setExiting(true), VISIBLE_MS);
    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (!exiting) return;
    const id = window.setTimeout(() => setToast(null), EXIT_MS);
    return () => window.clearTimeout(id);
  }, [exiting, setToast]);

  if (!toast) return null;

  return (
    <div
      // Mobile bottom = nav (55) + mini-player (50) + safe-area + 12px gap.
      // Desktop has no BottomNav, just clears the static ~78px desktop player.
      // If LAYOUT in styles/layout.ts changes, this calc needs the matching
      // px update — kept inline so Tailwind's JIT picks it up at build time.
      className={`fixed inset-x-0 ${Z.toast} flex items-center justify-center pointer-events-none px-4 bottom-[calc(105px+env(safe-area-inset-bottom)+12px)] sm:bottom-[100px]`}
      style={{
        animation: exiting
          ? `fadeOutDown ${EXIT_MS}ms ease-in forwards`
          : `fadeInUp ${EXIT_MS}ms ease-out`,
      }}
    >
      <button
        type="button"
        onClick={() => setExiting(true)}
        aria-label="Dismiss notification"
        className="pointer-events-auto bg-black border border-gold/60 text-white text-xs font-mono flex items-center gap-3 max-w-sm px-4 py-2 hover:text-gold transition-colors text-left cursor-pointer"
      >
        <span className="flex-1">{toast}</span>
        <BracketLabel>x</BracketLabel>
      </button>
    </div>
  );
}
