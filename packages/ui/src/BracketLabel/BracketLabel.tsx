import type { ReactNode } from "react";

// Form:at's terminal-bracket label, rendered as gold (default) or red brackets
// around the caller's content. Brackets are the brand's "this is a CTA / status
// pill" idiom; encapsulating them here means callers pass just the label text
// and the gold/red bracket treatment lives in one place.
//
// Used directly when the container is NOT a button (Toast pill, NavLinks active
// state, anchor-based dropdown options in AddToCalendar / BookingsButton).
// Used indirectly by <Button variant="secondary" | "fail"> which wraps its
// children in this for a consistent look across button + non-button surfaces.
//
// Tone:
//   "gold" — the brand-active treatment for all normal CTAs / statuses
//   "red"  — the failure / destructive-context treatment (the SaveForOffline
//            quota-failed state, retry surfaces). NEVER swap red → gold; the
//            colour carries semantics, not decoration.

type BracketTone = "gold" | "red";

export function BracketLabel({
  tone = "gold",
  children,
}: {
  tone?: BracketTone;
  children: ReactNode;
}) {
  const bracketClass = tone === "gold" ? "text-gold" : "text-red-400";
  return (
    // whitespace-nowrap so `[` and `]` never split from their content across a
    // line wrap — previously left to each caller to add, and one (the
    // AddToCalendar bracket row) forgot to. Owning it here removes the
    // opportunity to forget.
    <span className="whitespace-nowrap">
      <span className={bracketClass}>[</span> {children} <span className={bracketClass}>]</span>
    </span>
  );
}
