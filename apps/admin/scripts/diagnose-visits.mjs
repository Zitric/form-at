#!/usr/bin/env node
// Diagnoses an empty `visits` card on the admin dashboard by running the exact
// query `app/data/cf-analytics.ts` runs, and reporting WHICH cause is behind it.
//
// Why this exists in the repo rather than as a throwaway: the card deliberately
// collapses every failure to one state, because a dashboard is the wrong place
// to spell out auth errors. That is right for the UI and useless for debugging,
// so the diagnosis has to live somewhere — here. It has already settled two
// questions that guesswork got wrong:
//   1. The card was blamed on "no data yet"; it was actually a query error, and
//      the query had never once succeeded.
//   2. `confidence` turned out to take a REQUIRED `level` argument — the error
//      arrives as `error parsing args for "confidence": level: not a number`
//      inside an HTTP 200, which is invisible unless you read the body.
//
// Usage, from apps/admin:
//   export CF_ANALYTICS_TOKEN='...'      # the Pages secret on form-at-admin
//   pnpm diagnose-visits
//
// The token is read from the environment and never written anywhere. Account id
// and site tag are read from the committed config, so they can't drift from what
// the app actually uses.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";
const LEVEL = 0.95;

const token = process.env.CF_ANALYTICS_TOKEN;
if (!token) {
  console.error("Set CF_ANALYTICS_TOKEN (the Pages secret on form-at-admin) and re-run.");
  process.exit(1);
}

// Read both identifiers from the files the app reads, so a stale copy here
// can't send someone chasing a difference that doesn't exist in production.
function readConst(path, pattern, label) {
  const m = readFileSync(join(HERE, path), "utf8").match(pattern);
  if (!m) throw new Error(`couldn't read ${label} from ${path}`);
  return m[1];
}
const accountTag = readConst("../wrangler.toml", /CF_ACCOUNT_ID\s*=\s*"([^"]+)"/, "CF_ACCOUNT_ID");
const siteTag = readConst(
  "../../../packages/data/src/webAnalytics.ts",
  /WEB_ANALYTICS_SITE_TAG\s*=\s*"([^"]+)"/,
  "WEB_ANALYTICS_SITE_TAG",
);

const QUERY = `
  query($a: String!, $s: String!, $since: String!, $until: String!, $level: Float!) {
    viewer {
      accounts(filter: { accountTag: $a }) {
        rumPageloadEventsAdaptiveGroups(
          limit: 5000
          filter: { siteTag: $s, date_geq: $since, date_leq: $until }
          orderBy: [date_ASC]
        ) {
          count
          dimensions { date bot }
          sum { visits }
          avg { sampleInterval }
          confidence(level: $level) {
            level
            sum { visits { estimate lower upper isValid sampleSize } }
          }
        }
      }
    }
  }`;

const day = (d) => d.toISOString().slice(0, 10);
const until = new Date();
const daysBack = (n) => {
  const d = new Date(until);
  d.setUTCDate(d.getUTCDate() - (n - 1));
  return d;
};

async function run(windowDays) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: QUERY,
      variables: {
        a: accountTag,
        s: siteTag,
        since: day(daysBack(windowDays)),
        until: day(until),
        level: LEVEL,
      },
    }),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

function explainError(status, body) {
  const msg = JSON.stringify(body.errors);
  console.log(`\nerrors:\n  ${msg.slice(0, 600)}`);
  const low = msg.toLowerCase();
  if (status === 403 || low.includes("authentication") || low.includes("permission")) {
    console.log("\n=> CAUSE: token scope. Add Account -> Account Analytics -> Read.");
    console.log("   Keep the existing Zone -> Analytics -> Read; edge_traffic needs it.");
  } else if (low.includes("confidence") && low.includes("level")) {
    console.log("\n=> CAUSE: the `level` argument on `confidence` is wrong or missing.");
  } else if (low.includes("unknown field") || low.includes("cannot query")) {
    console.log("\n=> CAUSE: a field name in the query no longer exists. Paste this output.");
  } else {
    console.log("\n=> CAUSE: query rejected. Paste this output.");
  }
}

// The card queries the full retention-clamped window. A 7-day probe alone can't
// say whether the wider window returns the rows the coverage caption claims, nor
// whether per-row fields stay populated across it — so run both and compare.
console.log(`site=${siteTag.slice(0, 8)}…  account=${accountTag.slice(0, 8)}…  level=${LEVEL}`);

for (const windowDays of [7, 60]) {
  const { status, body } = await run(windowDays);
  console.log(`\n${"=".repeat(60)}\n${windowDays}-DAY WINDOW  (HTTP ${status})`);
  if (body.errors?.length) {
    explainError(status, body);
    continue;
  }
  const rows = body?.data?.viewer?.accounts?.[0]?.rumPageloadEventsAdaptiveGroups ?? [];
  if (rows.length === 0) {
    console.log("  no rows — credentials and query fine, nothing recorded in this window.");
    continue;
  }

  const human = rows.filter((r) => {
    const b = r.dimensions?.bot;
    return !(
      b === true ||
      (typeof b === "number" && b !== 0) ||
      (typeof b === "string" && b !== "0")
    );
  });
  const sum = (arr, f) => arr.reduce((a, x) => a + (f(x) ?? 0), 0);
  const conf = (r) => r.confidence?.sum?.visits ?? {};

  // The exact quantities the card computes, so a mismatch is attributable.
  const visits = sum(human, (r) => conf(r).estimate);
  const legacySum = sum(human, (r) => r.sum?.visits);
  const samples = sum(human, (r) => conf(r).sampleSize);
  const pageloads = sum(human, (r) => r.count);
  const missingSampleSize = human.filter((r) => conf(r).sampleSize == null).length;
  const intervals = [...new Set(rows.map((r) => r.avg?.sampleInterval ?? 1))].sort((a, b) => a - b);
  const dates = [...new Set(rows.map((r) => r.dimensions?.date))].sort();

  console.log(`  rows=${rows.length} (human ${human.length}, bot ${rows.length - human.length})`);
  console.log(`  distinct days=${dates.length}  first=${dates[0]}  last=${dates.at(-1)}`);
  console.log(`  sampleInterval values: ${intervals.join(", ")}`);
  console.log(
    `  visits(sum estimate)=${visits}   sum{visits}=${legacySum}   pageloads(count)=${pageloads}`,
  );
  console.log(
    `  sampleSize total=${samples}   rows missing sampleSize=${missingSampleSize}/${human.length}`,
  );
  if (samples !== pageloads) {
    console.log(`  !! sampleSize (${samples}) != pageloads (${pageloads}) — the card's "samples"`);
    console.log("     figure does not describe the same thing as its visit count.");
  }
  if (intervals.length === 1 && intervals[0] === 1) {
    console.log("  => unsampled: figures are EXACT counts, so the trend is honest and charts.");
  } else {
    console.log(`  => sampled (interval up to ${intervals.at(-1)}): figures are extrapolations.`);
  }
}
