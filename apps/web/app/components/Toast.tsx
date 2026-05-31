import { useEffect, useState } from "react";
import { useStore } from "~/store";

const VISIBLE_MS = 1700;
const EXIT_MS = 250;

// Lightweight transient message above the player/nav. Used by share buttons and
// anything else that needs a "copied / saved / done" confirmation. Slides up on
// enter, slides down on exit (250ms each), tap to dismiss immediately.
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
      className="fixed inset-x-0 z-40 flex items-center justify-center pointer-events-none px-4 bottom-[130px] sm:bottom-[100px]"
      style={{
        animation: exiting
          ? `fadeOutDown ${EXIT_MS}ms ease-in forwards`
          : `fadeInUp ${EXIT_MS}ms ease-out`,
      }}
    >
      <div className="bg-black border border-gold/40 text-gold text-xs font-mono px-4 py-2">
        [ {toast} ]
      </div>
    </div>
  );
}
