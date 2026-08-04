# Scripts

Every script in this folder is run via a `pnpm` command from `apps/web/`
(check `apps/web/package.json`'s `scripts` block if a command below ever
looks out of date — that file is the source of truth, this doc explains it).

| Command | Script | What it does |
|---|---|---|
| `pnpm send-push -- --title "..." --body "..."` | `send-push.ts` | Sends a push notification to every subscribed device. **Real production mechanism** — see [Notifications](#notifications-sending--configuring) below. |
| `pnpm optimize-images` | `optimize-images.ts` | Converts originals in `images-source/` into responsive AVIF + WebP variants in `public/images/`, and generates the same for every uploaded set's artwork (fetched from R2) into `public/images/uploads/`. Runs automatically as part of `pnpm build`. See `images-source/README.md`. |
| `pnpm og` | `generate-og.ts` | Generates social share banners (1200×630) — one global default plus one per DJ/set/event. Runs automatically as part of `pnpm build`. |
| `pnpm sitemap` | `generate-sitemap.ts` | Writes `public/sitemap.xml` from every static + dynamic route (DJs, sets, events). Runs automatically as part of `pnpm build`. |
| `pnpm screenshots` | `capture-screenshots.ts` | Builds the app, boots a preview server, and captures the two PNGs (`public/screenshots/narrow.png` / `wide.png`) Chrome shows in the Android install prompt. Re-run after a visual redesign. |
| `pnpm stats` | `stats.mjs` | Prints a play-analytics summary from the production D1 database. Add `--raw` to also dump the raw JSON per section. |

`pnpm og`, `pnpm sitemap`, and `optimize-images` don't need any setup beyond
`pnpm install`. `send-push` and `stats` both read from the production
Cloudflare D1 database and need an authenticated `wrangler` session
(`npx wrangler login` if you haven't already) — they shell out to
`wrangler d1 execute --remote` rather than opening their own connection, so
they reuse whatever account you're already logged into.

---

## Notifications — sending & configuring

`send-push.ts` is how Form:at announces new sets and events to subscribed
devices, until an admin panel exists (and as a manual override afterwards,
too).

### Setup (one-time)

You need `apps/web/.env` with `VAPID_PRIVATE_KEY_JWK` and
`VAPID_CONTACT_EMAIL` — copy `.env.example` and fill both in — plus a logged
in `wrangler` session (`npx wrangler login`). The private key is never
committed; it lives only in your local `.env`.

### How many people are subscribed

```bash
npx wrangler d1 execute form-at-analytics --remote --command "SELECT COUNT(*) AS subscriber_count FROM push_subscriptions"
```

### Normal send (what you'll use ~90% of the time)

```bash
cd apps/web
pnpm send-push -- --title "New set: DJ Name" --body "Fresh from the booth" --url "/sets/003"
```

### Fully-loaded send (every optional extra)

```bash
pnpm send-push -- --title "Event: Warehouse Session" --body "This Saturday, doors 11pm" \
  --url "/events/012" --image "/images/events/012-1080.webp" --require-interaction true
```

### What's configurable per send vs. always fixed

| Field | Type | Notes |
|---|---|---|
| `--title` / `--body` | always | required |
| `--url` | always | which screen the tap opens (falls back to `/` if omitted) |
| `--image` | optional | a relative path under `/images/...` (the site's own responsive-image output, **not** the audio CDN `cdn.formatglasgow.com` — that's audio-only). An absolute URL works too. |
| `--require-interaction true` | optional, default OFF | the notification won't auto-hide until the user dismisses it — reserve for something genuinely urgent, not a routine "new set" ping |
| vibration `[100, 50, 100]` | fixed | a short buzz-pause-buzz, not configurable — keeps the CLI simple |
| `view` / `later` action buttons | fixed | `view` opens the same URL as `--url`; `later` just closes the notification, no navigation |
| timestamp | automatic | captured at send time, no flag needed |
| `renotify` | dropped | investigated and confirmed pointless for this app — `tag` is already unique per send, so the "same tag replacing an old notification" case `renotify` exists for never happens here |

### After sending

The script prints a one-line summary: `sent=N dead_removed=N failed=N`.
`dead_removed` means a subscription returned a permanent 404/410 (browser
uninstalled, permission revoked at the OS level, endpoint expired) — those
rows are deleted automatically, nothing to do. `failed` is worth a re-run
later (rate limits, transient push-service errors); it does **not** delete
the row.

For the full design history (why `@pushforge/builder` over `web-push`, the
device-state machine behind who sees the CTA, on-device test checklists) see
`PWA_PROGRESS.md`'s Phase 2 section.
