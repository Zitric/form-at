import { useEffect, useState } from "react";
import { ToastShell } from "~/components/ToastShell";
import { useStore } from "~/store";

const VISIBLE_MS = 1700;
const EXIT_MS = 250;

// Lightweight transient message above the player/nav. Used by share buttons and
// anything else that needs a "copied / saved / done" confirmation. Slides up on
// enter, slides down on exit; auto-fades after VISIBLE_MS. The whole surface is
// click-to-dismiss so a user can clear it early if they want.
//
// No `[ x ]` glyph on purpose — this toast is ephemeral by design (auto-fades),
// so a close affordance would contradict that "you must dismiss this" reading.
// PlaybackErrorToast keeps its `[ x ]` because that one persists until the
// user acts.
//
// Surface/positioning come from `ToastShell` (extracted 2026-07-22, adopting
// the gold-border/grey-text/padding treatment `UpdateToast` shipped) — but
// this component's own timed enter/exit (`fadeInUp`/`fadeOutDown`, driven by
// `exiting` state) is a LIFECYCLE concern, kept separate from that visual
// unification: passed as `style`, which wins over `ToastShell`'s default
// `animate-fade-in-up` class via ordinary CSS specificity (inline style
// beats any class). Nothing about the auto-fade timing changed.
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
    <ToastShell
      variant="default"
      onClick={() => setExiting(true)}
      ariaLabel="Dismiss notification"
      style={{
        animation: exiting
          ? `fadeOutDown ${EXIT_MS}ms ease-in forwards`
          : `fadeInUp ${EXIT_MS}ms ease-out`,
      }}
    >
      <span className="text-grey">{toast}</span>
    </ToastShell>
  );
}
