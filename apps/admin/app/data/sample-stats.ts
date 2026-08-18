import type { SetStats } from "@form-at/data/set-stats";
import type { AdminDashboardStats } from "./admin-stats";
import type { EdgeTraffic, RumVisits } from "./cf-analytics";
import type { RumHistory } from "./rum-history";

// Substituted by `fetchRumHistory` when there's no Cloudflare env.
//
// Modelled on the REAL archive after its first capture (2026-08-11), including
// its awkward shapes rather than an idealised run: only 4 of the 7 covered days
// carry rows, one day is bot-only, and the counts are single digits. It also
// includes a deliberate UNCOVERED stretch before the archive started, so local
// dev and e2e exercise the gap rendering — the case that matters most, since a
// gap silently drawn as zero is the failure this card exists to prevent.
const SAMPLE_HISTORY_DAYS: RumHistory["days"] = [
  // Never captured — the archiver didn't exist yet.
  { day: "2026-08-02", visits: null, pageLoads: null, botPageLoads: null },
  { day: "2026-08-03", visits: null, pageLoads: null, botPageLoads: null },
  { day: "2026-08-04", visits: null, pageLoads: null, botPageLoads: null },
  // Covered from here. 08-05 and 08-06 were observed and genuinely had nothing.
  { day: "2026-08-05", visits: 0, pageLoads: 0, botPageLoads: 0 },
  { day: "2026-08-06", visits: 0, pageLoads: 0, botPageLoads: 0 },
  { day: "2026-08-07", visits: 4, pageLoads: 10, botPageLoads: 0 },
  { day: "2026-08-08", visits: 6, pageLoads: 12, botPageLoads: 0 },
  // Bot-only day: a crawler was the sole page load.
  { day: "2026-08-09", visits: 0, pageLoads: 0, botPageLoads: 1 },
  { day: "2026-08-10", visits: 1, pageLoads: 1, botPageLoads: 0 },
  { day: "2026-08-11", visits: 0, pageLoads: 0, botPageLoads: 0 },
];

export const SAMPLE_RUM_HISTORY: RumHistory = {
  days: SAMPLE_HISTORY_DAYS,
  coverageStart: "2026-08-05",
  coverageEnd: "2026-08-11",
  // Healthy on both signals — the ordinary state. The two stall cases (cron
  // stopped; cron firing but every read failing) are covered by unit tests
  // rather than made permanently visible in local dev.
  lastRunAt: Date.parse("2026-08-11T14:20:00Z"),
  lastSuccessAt: Date.parse("2026-08-11T14:20:00Z"),
  daysCovered: 7,
  daysUncovered: 3,
  totalVisits: 11,
  isSampleData: true,
};

// Substituted by `fetchRumVisitStats` when there's no Cloudflare env.
//
// Modelled on the real 7-day shape: unsampled, exact counts, degenerate
// interval. That combination is the ORDINARY state at this volume, so the
// fixture exercises it rather than an idealised one — chart renders, bounds
// suppressed. Visits far below edge requests, with a real bot share, because
// that gap is the whole reason both cards exist. The sampled path is covered by
// unit tests instead of being made permanently visible in local dev.
export const SAMPLE_RUM_VISITS: RumVisits = {
  visits: 41,
  visitsLower: 41,
  visitsUpper: 41,
  // Degenerate bounds and no usable interval — the ordinary state at this
  // volume. The chart still renders, because unsampled counts are exact.
  intervalValid: false,
  sampleInterval: 1,
  countsAreExact: true,
  confidenceLevel: 0.95,
  sampleSize: 41,
  pageloads: 96,
  botPageloads: 7,
  totalPageloads: 103,
  weeklyVisits: [41],
  noDataInWindow: false,
  daysWithData: 7,
  requestedWindowDays: 7,
  windowDays: 7,
  startDay: "2026-08-04",
  endDay: "2026-08-10",
};

// Substituted by `fetchEdgeTrafficStats` when there's no Cloudflare env, so
// local dev and e2e render the populated edge_traffic card rather than only its
// empty state.
//
// A 30-day window rather than 60, on purpose: it exercises the
// retention-clamped path (the card must report the window it actually got, not
// the one it asked for) and keeps the fixture honest about Cloudflare
// retention, not our choice, deciding the width.
export const SAMPLE_EDGE_TRAFFIC: EdgeTraffic = {
  requests: 18_432,
  pageViews: 4109,
  // WEEKLY buckets — 30 days ÷ 7 = 5 (four full weeks + a 2-day tail), which is
  // what a 30-day window really produces. A 30-length daily array here would
  // reproduce the bug this fixture is meant to catch.
  weeklyRequests: [4155, 4547, 4434, 4410, 886],
  windowDays: 30,
  startDay: "2026-07-09",
  boundaryKnown: true,
};

// Hand-written fixture, NOT a dump of real D1 tables — values are invented
// at this project's actual scale (tens, not thousands) and deliberately
// include shapes real data doesn't currently have, to stress rendering the
// happy path wouldn't exercise:
//   - installFunnel.dismissedTrend: an EMPTY array (0 buckets)
//   - appLaunches.weeklyTrend: an ALL-ZERO trend (9 zero buckets)
//   - pushSubscribers.weeklyGrowth: a large spike (15) next to single digits
//   - set-002-brandon-lee-vear's weeklyPlays: also empty, for a second
//     independent stress case in the per-set chart
// installToPushConversion.ratio intentionally exceeds 100% (17 push
// subscribers ÷ 9 install-accepted) — a real, if confusing-looking,
// consequence of the two aggregates having no shared key (see
// InstallToPushConversion's doc comment in admin-stats.ts); the fixture
// demonstrates the exact caveat the honesty caption warns about instead of
// hiding it behind a tidier invented number.
export const SAMPLE_ADMIN_DASHBOARD_STATS: AdminDashboardStats = {
  installFunnel: {
    shown: 24,
    accepted: 9,
    dismissed: 6,
    conversionRate: 9 / 24,
    shownTrend: [1, 2, 2, 3, 3, 4, 4, 5, 3],
    acceptedTrend: [0, 1, 1, 1, 2, 1, 2, 2, 1],
    dismissedTrend: [],
  },
  appLaunches: {
    total: 63,
    weeklyTrend: [0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  plays: {
    total: 41,
    offlineCount: 12,
    onlineCount: 25,
    excludedCount: 4,
    // A real-looking rising trend — plays are the one metric with history
    // longer than the window, so unlike appLaunches this is deliberately NOT
    // all zeros.
    weeklyTrend: [2, 3, 5, 4, 6, 5, 7, 6, 3],
    topSets: [
      { setId: "set-002-hubey", setTitle: "Form:at 002", setArtist: "hubey", playCount: 18 },
      { setId: "set-002-til", setTitle: "Form:at 002", setArtist: "t.i.l.", playCount: 12 },
      {
        setId: "set-002-brandon-lee-vear",
        setTitle: "Form:at 002",
        setArtist: "Brandon Lee Vear",
        playCount: 7,
      },
      {
        setId: "set-002-julz-lever",
        setTitle: "Form:at 002",
        setArtist: "Julz Lever",
        playCount: 4,
      },
    ],
  },
  pushSubscribers: {
    total: 17,
    standaloneCount: 17,
    tabCount: 0,
    weeklyGrowth: [1, 0, 1, 2, 15, 1, 0, 2, 1],
  },
  clicks: {
    saveClicks: 22,
    shareClicks: 8,
    perSet: [
      {
        setId: "set-002-hubey",
        setTitle: "Form:at 002",
        setArtist: "hubey",
        saveClicks: 9,
        shareClicks: 3,
      },
      {
        setId: "set-002-til",
        setTitle: "Form:at 002",
        setArtist: "t.i.l.",
        saveClicks: 7,
        shareClicks: 2,
      },
      {
        setId: "set-002-brandon-lee-vear",
        setTitle: "Form:at 002",
        setArtist: "Brandon Lee Vear",
        saveClicks: 4,
        shareClicks: 2,
      },
      {
        setId: "set-002-julz-lever",
        setTitle: "Form:at 002",
        setArtist: "Julz Lever",
        saveClicks: 2,
        shareClicks: 1,
      },
    ],
  },
  notifyFunnel: {
    // Above MIN_SAMPLE_FOR_RATE so acceptedRate renders as a real number
    // during a local visual pass — the suppressed (below-threshold) case is
    // covered by admin-stats.test.ts, not this fixture.
    promptShown: 30,
    installNudgeShown: 45,
    accepted: 12,
    declined: 18,
    acceptedRate: 12 / 30,
  },
  calendarAdds: {
    // Deliberately 0: this is the fixture's one demonstration of the "nothing
    // recorded yet" empty state, which every other metric here skips past.
    // Says nothing about production's current count.
    total: 0,
  },
  installToPushConversion: {
    installAccepted: 9,
    pushSubscribers: 17,
    ratio: 17 / 9,
  },
  eventsTrackingStartDay: "2026-07-20",
  pushTrackingStartDay: "2026-07-22",
  isSampleData: true,
};

// Substitutes for @form-at/data/set-stats's fetchSetStats (a shared,
// apps/web-consumed function this fixture must not touch) when the
// dashboard's per-set picker is in sample-data mode. Keyed by the real set
// IDs from @form-at/data/sets so every picker button has fixture data.
export const SAMPLE_SET_STATS: Record<string, SetStats> = {
  "set-002-til": {
    playCount: 12,
    totalSeconds: 38400,
    // Deliberately exceeds t.i.l.'s own 45:18 (2718s) track length —
    // avgSeconds is cumulative playback, not furthest position reached
    // (see the avg_engaged_listening honesty caption), so a listener who
    // scrubs back and replays sections can push this past the track's own
    // duration. The fixture demonstrates the exact case that caption
    // exists for.
    avgSeconds: 3200,
    countryCount: 4,
    firstPlay: null,
    lastPlay: null,
    topCountries: ["gb", "de", "us"],
    weeklyPlays: [1, 1, 2, 1, 2, 2, 1, 1, 1],
  },
  "set-002-hubey": {
    playCount: 18,
    totalSeconds: 11016,
    avgSeconds: 612,
    countryCount: 6,
    firstPlay: null,
    lastPlay: null,
    topCountries: ["gb", "nl", "ie"],
    weeklyPlays: [2, 2, 3, 1, 3, 2, 2, 2, 1],
  },
  "set-002-brandon-lee-vear": {
    playCount: 7,
    totalSeconds: 6230,
    avgSeconds: 890,
    countryCount: 2,
    firstPlay: null,
    lastPlay: null,
    topCountries: ["gb"],
    // Empty trend — a set with real lifetime plays but none in the visible
    // 60-day window (an old set, or one whose plays predate the window).
    weeklyPlays: [],
  },
  "set-002-julz-lever": {
    playCount: 4,
    totalSeconds: 624,
    avgSeconds: 156,
    countryCount: 1,
    firstPlay: null,
    lastPlay: null,
    topCountries: ["gb"],
    weeklyPlays: [0, 0, 0, 0, 0, 1, 0, 2, 1],
  },
};
