import { Label } from "@form-at/ui";
import { useContext } from "react";
import type { MilestoneKind } from "~/utils/milestones";
import { MilestonesContext } from "./MilestonesContext";

// What the trend charts' marker lines mean. One per tab rather than one per
// chart: the same milestones mark every chart, and a legend under each would
// repeat itself a dozen times. The lines carry their own date and label on
// hover too.

// The line each kind draws, as a glyph: solid, long dash, short dash, dotted.
const KIND_GLYPH: Record<MilestoneKind, string> = {
  launch: "━━",
  event: "┅┅",
  push: "┄┄",
  upload: "┈┈",
};

const fmtDay = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

export function MilestoneLegend() {
  const milestones = useContext(MilestonesContext);
  if (milestones.length === 0) return null;
  return (
    <div className="mb-6 text-xs text-grey/70 space-y-0.5">
      <Label className="mb-1 block text-xs text-grey">markers on the trend charts</Label>
      {milestones.map((m) => (
        <p key={`${m.date}-${m.kind}-${m.label}`}>
          <span className={m.kind === "launch" || m.kind === "event" ? "text-white" : "text-grey"}>
            {KIND_GLYPH[m.kind]}
          </span>{" "}
          {fmtDay.format(new Date(`${m.date}T00:00:00Z`))} · {m.label}
        </p>
      ))}
    </div>
  );
}
