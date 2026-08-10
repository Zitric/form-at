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
const since = new Date(until);
since.setUTCDate(since.getUTCDate() - 6);

const res = await fetch(ENDPOINT, {
  method: "POST",
  headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    query: QUERY,
    variables: { a: accountTag, s: siteTag, since: day(since), until: day(until), level: LEVEL },
  }),
});
const body = await res.json().catch(() => ({}));

console.log(`HTTP ${res.status}  site=${siteTag.slice(0, 8)}…  account=${accountTag.slice(0, 8)}…`);

// Cloudflare reports query errors inside a 200 body — checking the status alone
// is exactly how this went undiagnosed.
if (body.errors?.length) {
  const msg = JSON.stringify(body.errors);
  console.log(`\nerrors:\n  ${msg.slice(0, 600)}`);
  const low = msg.toLowerCase();
  if (res.status === 403 || low.includes("authentication") || low.includes("permission")) {
    console.log("\n=> CAUSE: token scope. Add Account -> Account Analytics -> Read.");
    console.log("   Keep the existing Zone -> Analytics -> Read; edge_traffic needs it.");
  } else if (low.includes("confidence") && low.includes("level")) {
    console.log("\n=> CAUSE: the `level` argument on `confidence` is wrong or missing.");
  } else if (low.includes("unknown field") || low.includes("cannot query")) {
    console.log("\n=> CAUSE: a field name in the query no longer exists. Paste this output.");
  } else {
    console.log("\n=> CAUSE: query rejected. Paste this output.");
  }
  process.exit(0);
}

const rows = body?.data?.viewer?.accounts?.[0]?.rumPageloadEventsAdaptiveGroups ?? [];
console.log(`query OK, rows: ${rows.length}`);
if (rows.length === 0) {
  console.log("\n=> CAUSE: no data yet. Credentials and query are fine — the beacon simply");
  console.log("   hasn't recorded anything in this window. Nothing to fix.");
  process.exit(0);
}

let sumVisits = 0;
let sumEstimate = 0;
for (const r of rows) {
  const c = r.confidence?.sum?.visits ?? {};
  sumVisits += r.sum?.visits ?? 0;
  sumEstimate += c.estimate ?? 0;
  console.log(
    `  ${r.dimensions?.date} bot=${r.dimensions?.bot} count=${r.count} ` +
      `visits=${r.sum?.visits} level=${r.confidence?.level} ` +
      `estimate=${c.estimate} [${c.lower}, ${c.upper}] isValid=${c.isValid} n=${c.sampleSize}`,
  );
}

// The two questions the card's design depends on.
const estimateVerdict =
  sumEstimate === sumVisits
    ? "IDENTICAL, so the plain sum query is redundant and can be dropped."
    : "DIFFERENT, so both are needed; keep the sum as the fallback.";
console.log(`\nestimate vs sum{visits}: ${sumEstimate} vs ${sumVisits} — ${estimateVerdict}`);
const anyInvalid = rows.some((r) => r.confidence?.sum?.visits?.isValid === false);
console.log(
  anyInvalid
    ? "isValid: FALSE on at least one day — the card suppresses bounds and chart, as designed."
    : "isValid: true across the window — the card shows the interval and plots the trend.",
);
