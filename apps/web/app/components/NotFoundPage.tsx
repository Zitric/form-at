import { Body, BracketLabel, TerminalRow } from "@form-at/ui";

import { Link } from "@tanstack/react-router";
import { PageLayout } from "~/components/PageLayout";

// Single 404 renderer consumed by BOTH:
//   - `notFoundComponent` in `routes/__root.tsx` (unmatched child routes)
//   - the splat route `routes/$.tsx` (wildcard-matched URLs resolving to
//     no known page)
//
// Both routes render this one component so their markup can't drift apart.
//
// Design: same "centered status page" family as `offline.html` — single column,
// centered, terminal-style `›` prompt via `TerminalRow`, gold-bracket
// `[ 404 ]` pill, and `SIGNAL_LOST` at the app's normal heading scale
// (t-heading / t-heading-md, deliberately NOT display-sized — at text-5xl it
// dwarfs the rest of the layout).
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
