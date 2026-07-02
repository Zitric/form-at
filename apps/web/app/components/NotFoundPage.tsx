import { Link } from "@tanstack/react-router";
import { BracketLabel } from "~/components/BracketLabel";
import { PageLayout } from "~/components/PageLayout";
import { TerminalRow } from "~/components/TerminalRow";
import { Body } from "~/components/Text";

// Single 404 renderer consumed by BOTH:
//   - `notFoundComponent` in `routes/__root.tsx` (unmatched child routes)
//   - the splat route `routes/$.tsx` (wildcard-matched URLs resolving to
//     no known page)
//
// A previous revision had two hand-rolled versions that drifted (the
// RootNotFound path had a `hover:border-purple` link — the only purple
// hover in the app — and a `<Body>` component wrapping the message; the
// splat path used a plain `<p>` and `hover:border-gold`). Both also
// rendered SIGNAL_LOST at display size (text-5xl / text-7xl) which
// dwarfed the rest of the layout. This component unifies both routes so
// the drift can't happen again.
//
// Design: same "centered status page" family as `offline.html` — single
// column, everything centered, terminal-style `›` prompt via
// `TerminalRow`, gold-bracket `[ 404 ]` status pill, `SIGNAL_LOST` at the
// app's normal heading scale (t-heading / t-heading-md — 22px / 26px, NOT
// display-sized), and a secondary-bracket return link matching Button's
// visual contract (grey → white on hover, gold brackets stay gold).
export function NotFoundPage() {
  return (
    <PageLayout>
      <div className="flex-1 flex flex-col items-center justify-center text-center gap-5">
        <TerminalRow label="status" value={<BracketLabel>404</BracketLabel>} />
        <h1 className="t-heading sm:t-heading-md font-mono tracking-widest">SIGNAL_LOST</h1>
        <Body className="max-w-sm">transmission not found — this frequency doesn't exist</Body>
        <Link
          to="/"
          className="text-sm text-grey hover:text-white transition-colors tracking-widest whitespace-nowrap"
        >
          <BracketLabel>‹ return_to_base</BracketLabel>
        </Link>
      </div>
    </PageLayout>
  );
}
