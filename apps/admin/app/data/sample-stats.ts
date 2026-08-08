import type { SetStats } from "@form-at/data/set-stats";
import type { AdminDashboardStats } from "./admin-stats";

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
    // Genuinely 0 today — collection hasn't been deployed long enough to
    // accumulate any. Demonstrates the "nothing recorded yet" empty state.
    total: 0,
  },
  installToPushConversion: {
    installAccepted: 9,
    pushSubscribers: 17,
    ratio: 17 / 9,
  },
  // A 30-day window rather than 60, on purpose: it exercises the
  // retention-clamped path (the card must report the window it actually got,
  // not the one it asked for) and keeps the sample honest about the fact that
  // Cloudflare retention, not our choice, decides the width.
  edgeTraffic: {
    requests: 18_432,
    pageViews: 4109,
    dailyRequests: [
      512, 488, 601, 640, 587, 622, 705, 668, 590, 631, 712, 690, 655, 601, 578, 640, 702, 688, 671,
      645, 613, 590, 622, 660, 701, 688, 640, 612, 598, 621,
    ],
    windowDays: 30,
    startDay: "2026-07-09",
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
