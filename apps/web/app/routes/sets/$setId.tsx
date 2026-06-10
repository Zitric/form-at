import { Link, createFileRoute, notFound } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ConsoleWriter } from "~/components/ConsoleWriter";
import { Image } from "~/components/Image";
import { JsonLd } from "~/components/JsonLd";
import { PageLayout } from "~/components/PageLayout";
import { ShareSetButton } from "~/components/ShareSetButton";
import { TerminalRow } from "~/components/TerminalRow";
import { Label, PageTitle } from "~/components/Text";
import { PauseIcon, PlayIcon } from "~/components/player";
import { fetchSetStats } from "~/data/set-stats";
import type { SetStats } from "~/data/set-stats";
import { getSet } from "~/data/sets";
import { useTypedOnce } from "~/hooks/useTypedOnce";
import { useStore } from "~/store";
import { asciiBar, countryFlag, fmtDate, fmtTimestamp } from "~/utils/fmt";
import { pageHead } from "~/utils/head";
import { setLd } from "~/utils/jsonld";

export const Route = createFileRoute("/sets/$setId")({
  validateSearch: (search: Record<string, unknown>): { t?: number } => {
    const raw = search.t;
    const n = typeof raw === "string" || typeof raw === "number" ? Number(raw) : Number.NaN;
    return Number.isFinite(n) && n > 0 ? { t: Math.floor(n) } : {};
  },
  loader: async ({ params }) => {
    const set = getSet(params.setId);
    if (!set) throw notFound();
    const stats = await fetchSetStats({ data: params.setId }).catch(() => null);
    return { set, stats };
  },
  // Stats barely change minute-to-minute — reuse the cached payload for 5 min so
  // navigating away and back doesn't re-hit D1.
  staleTime: 5 * 60 * 1000,
  // Keep cached stats in memory for 30 min after the route unmounts.
  gcTime: 30 * 60 * 1000,
  head: ({ loaderData }) => {
    const set = loaderData?.set;
    if (!set) return {};
    return pageHead({
      title: `${set.artist} — ${set.title} · ${set.date}`,
      description: set.description ?? `Recorded set from ${set.artist} at ${set.title}, Glasgow.`,
      path: `/sets/${set.id}`,
      // Per-set banner generated at build by scripts/generate-og.ts (artwork
      // + artist + title composition). Falls back to /og-image.png if missing.
      image: set.artwork ? `/og/sets/${set.id}.png` : undefined,
    });
  },
  component: SetDetail,
});

function buildStatsRows(stats: SetStats): Array<[string, ReactNode]> {
  const rows: Array<[string, ReactNode]> = [["plays", `${stats.playCount}`]];
  if (stats.countryCount > 0)
    rows.push([
      "reach",
      `${stats.countryCount} ${stats.countryCount === 1 ? "territory" : "territories"}`,
    ]);
  if (stats.topCountries.length > 0) {
    const upper = stats.topCountries.map((c) => c.toUpperCase());
    // Two-column layout (≥sm) is tighter, so we drop the country codes and
    // keep just the flag glyphs. Single-column mobile has room for both.
    const flagsWithCodes = upper
      .map((code) => {
        const flag = countryFlag(code);
        return flag ? `${flag} ${code}` : code;
      })
      .join("  ·  ");
    const flagsOnly = upper.map(countryFlag).filter(Boolean).join("  ·  ");
    rows.push([
      "top_territories",
      <>
        <span key="mobile" className="sm:hidden">
          {flagsWithCodes}
        </span>
        <span key="desktop" className="hidden sm:inline">
          {flagsOnly}
        </span>
      </>,
    ]);
  }
  return rows;
}

function SetDetail() {
  const { set, stats } = Route.useLoaderData();
  const { t } = Route.useSearch();
  const nowPlaying = useStore((s) => s.nowPlaying);
  const isPlaying = useStore((s) => s.isPlaying);
  const playTrack = useStore((s) => s.playTrack);
  const isLoaded = nowPlaying?.id === set.id;
  const isThisPlaying = isLoaded && isPlaying;

  const isFirstLoading = useTypedOnce("set-detail");

  // Event + date are now surfaced in the subtitle under the artist name; the
  // meta block carries the remaining playback-relevant attributes only.
  const metaRows: Array<[string, string]> = (
    [set.duration && ["duration", set.duration]] as Array<[string, string] | false>
  ).filter((row): row is [string, string] => Boolean(row));

  const statsRows = stats ? buildStatsRows(stats) : [];

  // The set arrives via a shared deeplink (?t=…) and hasn't been loaded yet —
  // apply the timestamp override on the first click only. Subsequent clicks
  // (resume/pause) shouldn't fight the user's listening position.
  const shouldStartAtSharedTime = !isLoaded && t !== undefined;
  const playTrackOptions = shouldStartAtSharedTime ? { startTime: t } : undefined;

  const playButtonLabel = isThisPlaying
    ? "now_playing"
    : shouldStartAtSharedTime
      ? `play @ ${fmtTimestamp(t)}`
      : "play_set";

  const statusIndicator = isThisPlaying ? (
    <span className="text-gold">[ live ]</span>
  ) : (
    <span>[ ready ]</span>
  );

  return (
    <PageLayout>
      <JsonLd data={setLd(set)} />
      <div className="flex-1">
        <Link
          to="/sets"
          preload="intent"
          className="inline-flex items-center gap-2 text-sm sm:text-base text-grey hover:text-purple transition-colors mb-10"
        >
          ‹ sets_archive
        </Link>

        {set.artwork && (
          <Image
            src={set.artwork}
            alt={set.title}
            sizes="(min-width: 768px) 448px, 100vw"
            priority
            className="w-full max-w-md aspect-square object-cover mb-6 mx-auto rounded-card"
          />
        )}

        {/* Identity — artist as the page's h1, with event + date as a tight
            subtitle so listeners landing from a share link immediately see
            who/what/when before anything else. */}
        <PageTitle
          as="h1"
          className="text-3xl sm:text-4xl font-bold leading-tight tracking-tight mb-1"
        >
          {set.artist}
        </PageTitle>
        <p className="text-sm sm:text-base text-grey mb-6">
          @ {set.title}
          {set.date && ` · ${set.date}`}
        </p>

        {/* Primary action */}
        <button
          type="button"
          onClick={() => playTrack(set, playTrackOptions)}
          className="flex items-center justify-center gap-4 w-full sm:min-w-[280px] border-2 border-gold px-6 py-4 mb-6! text-sm text-grey shadow-[0_0_15px_rgba(197,133,56,0.2)] hover:shadow-[0_0_25px_rgba(197,133,56,0.4)] hover:cursor-pointer  transition-all group"
          style={{ animation: "border-pulse 2s infinite" }}
        >
          <span className="text-gold">{isThisPlaying ? <PauseIcon /> : <PlayIcon />}</span>
          {playButtonLabel}
        </button>

        <ShareSetButton set={set} />

        {/* Description — moved above meta so the "what is this set" payload
            isn't buried below dim metadata rows. */}
        {set.description && (
          <ConsoleWriter isFirstLoading={isFirstLoading}>{set.description}</ConsoleWriter>
        )}

        {/* Two-column block: track properties on the left (recording facts +
            historical anchors), broadcast metrics on the right (analytics +
            sparkline). Stacks on mobile, sits side-by-side on sm+. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-8 mt-8 mb-8">
          <div>
            <Label className="mb-2 text-grey tracking-widest">{"// properties"}</Label>
            <div className="space-y-1">
              {metaRows.map(([label, value]) => (
                <TerminalRow key={label} label={label} value={value} />
              ))}
              <TerminalRow label="status" value={statusIndicator} />
              {stats?.firstPlay && (
                <TerminalRow label="first_signal" value={fmtDate(stats.firstPlay)} dimValue />
              )}
              {stats?.lastPlay && (
                <TerminalRow label="last_signal" value={fmtDate(stats.lastPlay)} dimValue />
              )}
            </div>
          </div>

          {statsRows.length > 0 && stats && (
            <div>
              <Label className="mb-2 text-grey tracking-widest">{"// broadcast_metrics"}</Label>
              <div className="space-y-1">
                {statsRows.map(([label, value]) => (
                  <TerminalRow key={label} label={label} value={value} dimValue />
                ))}
                <TerminalRow label="last_60d" value={asciiBar(stats.weeklyPlays)} dimValue />
              </div>
            </div>
          )}
        </div>
      </div>
    </PageLayout>
  );
}
