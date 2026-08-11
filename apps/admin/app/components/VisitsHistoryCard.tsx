import { RUM_UNSAMPLED_DAYS } from "@form-at/data/rumArchive";
import { Label, Muted, TerminalRow } from "@form-at/ui";
import type { RumHistory } from "~/data/rum-history";
import { TrendChart } from "./TrendChart";

// Reads the `rum_daily` archive, NOT the live Cloudflare API — deliberately a
// separate card from `visits` rather than one series stitched from both. The
// two have different provenance (D1 rows captured by a cron vs a live read),
// and putting them behind one number would hide exactly the kind of seam this
// dashboard has repeatedly got wrong.
//
// Daily buckets, not weekly: at this volume a week collapses 4 real
// observations into one bar and the shape disappears.

/** Beyond this many days without a capture, the archive is treated as stale.
 *  One full unsampled window plus a day of slack: within the window a missed
 *  run costs nothing because the next one re-fetches it, so warning earlier
 *  would cry wolf. Past it, days start ageing out unarchived — which is
 *  unrecoverable, so that's the moment worth flagging. */
const ARCHIVE_STALE_AFTER_DAYS = RUM_UNSAMPLED_DAYS + 1;

const dayFormat = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
const fmtDay = (iso: string | null) => (iso ? dayFormat.format(new Date(`${iso}T00:00:00Z`)) : "—");

export function VisitsHistoryCard({ history }: { history: RumHistory | null }) {
  if (!history) {
    return (
      <Muted className="block text-xs">
        couldn't read the archive — the analytics database isn't reachable. This is a failed read,
        not an empty archive: no rows would report itself separately.
      </Muted>
    );
  }
  if (history.days.length === 0) {
    return (
      <Muted className="block text-xs">
        nothing archived yet. The capture runs daily and stores the trailing {RUM_UNSAMPLED_DAYS}{" "}
        days, so the first rows appear after its first successful run — this is an empty archive,
        not a failure.
      </Muted>
    );
  }

  // Clamped at 0: a capture timestamped later today than the render is a clock
  // skew between the Worker and this reader, not negative age.
  const ageDays =
    history.lastCapturedAt === null
      ? null
      : Math.max(0, Math.floor((Date.now() - history.lastCapturedAt) / 86_400_000));
  const isStale = ageDays !== null && ageDays >= ARCHIVE_STALE_AFTER_DAYS;

  return (
    <>
      <div className="space-y-1">
        <TerminalRow label="visits" value={String(history.totalVisits)} dimValue />
        <TerminalRow label="days_covered" value={String(history.daysCovered)} dimValue />
        {history.daysUncovered > 0 && (
          <TerminalRow label="days_not_captured" value={String(history.daysUncovered)} dimValue />
        )}
        <TerminalRow
          label="archive_since"
          value={`${fmtDay(history.coverageStart)} – ${fmtDay(history.coverageEnd)}`}
          dimValue
        />
      </div>

      <div className="mt-3">
        <Label className="mb-1 block text-xs text-grey">daily_visits</Label>
        {/* bucketDays={1}: daily bars. Nulls reach the chart as shaded gaps —
            never mapped to 0, which would render an outage as flat traffic. */}
        <TrendChart data={history.days.map((d) => d.visits)} bucketDays={1} />
      </div>

      <p className="mt-3 text-xs text-grey/70">
        archived daily from Cloudflare Web Analytics before it degrades — Cloudflare keeps beacon
        data exact for {RUM_UNSAMPLED_DAYS} days, then aggregates it to about 10%, so this table is
        the only accurate record past a week. Same definition of a visit as the live card: an
        arrival from another site or a direct link.
      </p>

      {history.daysUncovered > 0 && (
        <p className="mt-1 text-xs text-grey/70">
          shaded days were never captured — the archive covers {fmtDay(history.coverageStart)}{" "}
          onward, and anything outside that is unknown rather than zero. A captured day with no
          visits is drawn as a real zero.
        </p>
      )}

      {isStale && (
        <p className="mt-1 text-xs text-gold">
          archive last updated {ageDays}d ago — the capture has stopped. Days older than{" "}
          {RUM_UNSAMPLED_DAYS} are ageing out of Cloudflare's exact window unarchived, and that loss
          can't be recovered. Check the Worker's cron.
        </p>
      )}

      {/* Unconditional, deliberately — it used to render only on the fresh
          branch, so the one fact a reader most needs when the capture HAS
          stopped ("you are only seeing this because you happened to look")
          vanished at exactly the moment it mattered. */}
      {ageDays !== null && (
        <p className="mt-1 text-xs text-grey/70">
          archive last updated {ageDays === 0 ? "today" : `${ageDays}d ago`}. Staleness surfaces
          only when someone opens the dashboard — nothing pushes an alert if the capture stops.
        </p>
      )}
    </>
  );
}
