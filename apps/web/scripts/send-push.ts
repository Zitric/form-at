#!/usr/bin/env tsx
/**
 * Send a push notification to every subscribed device.
 *
 * THIS IS THE REAL PRODUCTION MECHANISM — not a test script. Every run
 * reaches real subscribers' devices. Use it to announce new sets and new
 * events until an admin panel exists (and afterward too, as a manual
 * override — see PWA_PROGRESS.md's Phase 2 section, "How to send an
 * announcement today").
 *
 * Usage (from apps/web/) — a plain send needs only title/body/url:
 *   pnpm send-push -- --title "New set: DJ Name" --body "Fresh from the booth" --url /sets/003
 *   pnpm send-push -- --title "Event: Warehouse Session" --body "This Saturday" --url /events/012
 *
 * Every other option is opt-in (2026-07-21):
 *   --image <url>              large artwork in the expanded notification.
 *                              A site-relative path (e.g. /images/sets/003-1080.webp)
 *                              works fine — it resolves against the SW's own
 *                              origin, same as icon/badge already do; an
 *                              absolute URL works too if that's more
 *                              convenient. Set/event artwork lives on
 *                              formatglasgow.com's own /images/ path, NOT on
 *                              cdn.formatglasgow.com — that CDN is audio-only
 *                              (TECH_DEBT 19), verified against
 *                              app/utils/jsonld.ts's imageUrl() helper.
 *   --require-interaction true  keeps the notification visible until the
 *                              user dismisses it, instead of auto-hiding.
 *                              Defaults off — reserve `true` for something
 *                              genuinely urgent; a routine new-set ping
 *                              should be allowed to auto-hide.
 *
 * Every send also gets, with no flag needed: a short non-intrusive vibration,
 * "view" / "later" action buttons, and the actual send time as the
 * notification's timestamp — see ~/utils/pushNotification.ts.
 *
 * Requires `apps/web/.env` with VAPID_PRIVATE_KEY_JWK + VAPID_CONTACT_EMAIL
 * (see .env.example) and an authenticated `wrangler` session (`npx wrangler
 * login` if needed) — this script shells out to `wrangler d1 execute
 * --remote` rather than opening its own D1 connection, deliberately reusing
 * your existing auth instead of needing its own credentials (see the Step 5
 * design note in PWA_PROGRESS.md for why this is a local script, not a
 * public HTTP endpoint).
 */
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type PushPayload,
  type PushSubscriptionRecord,
  type SendPushResult,
  sendWebPush,
} from "../app/utils/webPush";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");
const WRANGLER_CONFIG = join(REPO_ROOT, "wrangler.toml");
const D1_DATABASE = "form-at-analytics";

try {
  process.loadEnvFile(join(__dirname, "..", ".env"));
} catch {
  console.error(
    "Couldn't load apps/web/.env — copy .env.example to .env and fill in VAPID_PRIVATE_KEY_JWK + VAPID_CONTACT_EMAIL first.",
  );
  process.exit(1);
}

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    args[key] = value;
    i++;
  }
  return args;
}

// D1 has no CLI parameter-binding for ad-hoc `--command` queries (only
// `--file` supports bound statements, and only for INSERT/UPDATE batches at
// that) — so a value that must be interpolated into a `--command` string
// gets the standard SQL string-literal escape (double the single quotes).
// The only caller is the dead-subscription DELETE below, and `endpoint`
// values are push-service URLs (FCM/Mozilla autopush — alphanumeric, `-`,
// `_`, `/`, `:`, `.` only, never a quote) that were already validated at
// insert time in `api/push-subscribe.ts`, but this escape is cheap
// insurance rather than trusting that shape holds forever.
function escapeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}

// Shells out to `wrangler d1 execute --remote --json`. The `[{ results,
// success, meta }]` wrapper (array of one result set) is wrangler's
// documented `--json` output shape for a single `--command` — verified
// against Cloudflare's own examples in past sessions, not re-fetched live
// in this one (no network research budget left this session). Defensively
// checked below rather than trusted blindly: if a wrangler version ever
// changes this shape, this throws a clear error instead of silently
// sending to zero subscribers or crashing on an obscure `undefined.map`.
function runD1Command<T>(command: string): T[] {
  const output = execFileSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      D1_DATABASE,
      "--remote",
      "--json",
      "--config",
      WRANGLER_CONFIG,
      "--command",
      command,
    ],
    { encoding: "utf-8", cwd: REPO_ROOT },
  );

  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error(`wrangler d1 execute did not return valid JSON:\n${output}`);
  }

  if (!Array.isArray(parsed) || !Array.isArray((parsed[0] as { results?: unknown })?.results)) {
    throw new Error(
      `Unexpected wrangler d1 execute --json shape — inspect manually:\n${JSON.stringify(parsed, null, 2)}`,
    );
  }

  return (parsed[0] as { results: T[] }).results;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.title || !args.body) {
    console.error('Usage: pnpm send-push -- --title "..." --body "..." [--url /sets/003]');
    process.exit(1);
  }

  const privateJWKRaw = process.env.VAPID_PRIVATE_KEY_JWK;
  const contact = process.env.VAPID_CONTACT_EMAIL;
  if (!privateJWKRaw || !contact) {
    console.error(
      "Missing VAPID_PRIVATE_KEY_JWK or VAPID_CONTACT_EMAIL in apps/web/.env — see .env.example.",
    );
    process.exit(1);
  }
  const privateJWK: JsonWebKey = JSON.parse(privateJWKRaw);

  const payload: PushPayload = {
    title: args.title,
    body: args.body,
    url: args.url,
    image: args.image,
    // The actual send time, not "now" at display — meaningful given the 24h
    // TTL (sendWebPush's ttl option): a push that arrives after the device
    // comes back online should show when it was actually sent, not the
    // delivery moment. Always included — trivial, no flag needed.
    timestamp: Date.now(),
  };
  // Omitted rather than set to `false` when absent — keeps the payload
  // honest about what THIS send actually asked for (same convention as
  // buildNotificationOptions in ~/utils/pushNotification.ts).
  if (args["require-interaction"] === "true") payload.requireInteraction = true;

  console.log(`Reading subscriptions from ${D1_DATABASE}.push_subscriptions...`);
  const rows = runD1Command<{ endpoint: string; p256dh: string; auth: string }>(
    "SELECT endpoint, p256dh, auth FROM push_subscriptions",
  );

  if (rows.length === 0) {
    console.log("No subscriptions found — nothing to send.");
    return;
  }

  console.log(`Sending to ${rows.length} subscriber(s)...`);

  let sent = 0;
  let deadRemoved = 0;
  let failed = 0;

  for (const row of rows) {
    const subscription: PushSubscriptionRecord = {
      endpoint: row.endpoint,
      keys: { p256dh: row.p256dh, auth: row.auth },
    };

    const shortEndpoint = `${row.endpoint.slice(0, 60)}...`;

    // Per-subscription isolation: sendWebPush can THROW, not just return a
    // failed outcome — @pushforge/builder throws on malformed stored keys
    // (bad p256dh/auth length) and `fetch` rejects on network errors. One
    // bad row must not abort the whole announcement for everyone after it.
    let result: SendPushResult;
    try {
      result = await sendWebPush(subscription, payload, { privateJWK, contact });
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : String(error);
      console.log(`  threw (${message}): ${shortEndpoint}`);
      continue;
    }

    if (result.outcome === "sent") {
      sent++;
    } else if (result.outcome === "dead") {
      deadRemoved++;
      console.log(`  dead (${result.status}), removing: ${shortEndpoint}`);
      runD1Command(
        `DELETE FROM push_subscriptions WHERE endpoint = '${escapeSqlString(row.endpoint)}'`,
      );
    } else {
      failed++;
      console.log(`  failed (${result.status} ${result.statusText}): ${shortEndpoint}`);
    }
  }

  console.log(`\nDone. sent=${sent} dead_removed=${deadRemoved} failed=${failed}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
