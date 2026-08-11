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
    // No coverage at all splits two ways, and they are not the same news. Runs
    // that all FAILED mean the cron is working and the reads aren't — a
    // problem — whereas no runs at all is just a young archive.
    if (history.lastRunAt !== null) {
      return (
        <Muted className="block text-xs text-gold">
          the capture has run but never succeeded — every attempt failed to read Cloudflare, so
          nothing has been archived. This is not an empty archive: the cron is firing. Check the
          Worker's <span className="font-mono">CF_ANALYTICS_TOKEN</span>.
        </Muted>
      );
    }
    return (
      <Muted className="block text-xs">
        nothing archived yet. The capture runs daily and stores the trailing {RUM_UNSAMPLED_DAYS}{" "}
        days, so the first rows appear after its first successful run — this is an empty archive,
        not a failure.
      </Muted>
    );
  }

  // Clamped at 0: a capture timestamped later today than the render is clock
  // skew between the Worker and this reader, not negative age.
  const ageInDays = (at: number | null) =>
    at === null ? null : Math.max(0, Math.floor((Date.now() - at) / 86_400_000));

  // TWO signals, never collapsed. `runAge` answers "is the cron firing?";
  // `successAge` answers "is it capturing anything?". A cron that fires daily
  // and fails every read is fresh by the first and stale by the second — the
  // exact scenario this warning exists for, and one that reporting only the
  // last run would hide completely. They need different fixes, so the card says
  // which it is rather than showing one "stale" state for both.
  const runAge = ageInDays(history.lastRunAt);
  const successAge = ageInDays(history.lastSuccessAt);
  const cronStalled = runAge === null || runAge >= ARCHIVE_STALE_AFTER_DAYS;
  const capturesStalled = successAge === null || successAge >= ARCHIVE_STALE_AFTER_DAYS;

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

      {/* The two stalls are named separately because they are different faults
          with different fixes. Checking the cron when the cron is fine and the
          token is expired sends you to the wrong place entirely. Both share the
          consequence sentence: days ageing out unarchived is unrecoverable
          however the capture stopped. */}
      {cronStalled && (
        <p className="mt-1 text-xs text-gold">
          the capture hasn't run in {runAge === null ? "any recorded run" : `${runAge}d`} — the cron
          itself has stopped firing. Days older than {RUM_UNSAMPLED_DAYS} are ageing out of
          Cloudflare's exact window unarchived, and that loss can't be recovered. Check the Worker's
          cron trigger.
        </p>
      )}

      {!cronStalled && capturesStalled && (
        <p className="mt-1 text-xs text-gold">
          the cron last ran {runAge === 0 ? "today" : `${runAge}d ago`} but hasn't captured anything
          in {successAge === null ? "any recorded run" : `${successAge}d`} — it is firing and every
          read is failing, which is a different fault from a stopped cron. Days are ageing out
          unarchived meanwhile. Check the Worker's{" "}
          <span className="font-mono">CF_ANALYTICS_TOKEN</span> and its logs, not the trigger.
        </p>
      )}

      {/* Unconditional, deliberately — it used to render only on the healthy
          branch, so the one fact a reader most needs when the capture HAS
          stopped ("you are only seeing this because you happened to look")
          vanished at exactly the moment it mattered. */}
      <p className="mt-1 text-xs text-grey/70">
        cron last ran {runAge === null ? "never" : runAge === 0 ? "today" : `${runAge}d ago`}; last
        successful capture{" "}
        {successAge === null ? "never" : successAge === 0 ? "today" : `${successAge}d ago`}. Both
        surface only when someone opens the dashboard — nothing pushes an alert if either stops.
      </p>
    </>
  );
}
