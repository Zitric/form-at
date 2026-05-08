# Form:at

Website for Form:at — a techno collective based in Glasgow.

Live at [formatglasgow.com](https://formatglasgow.com)

---

## Stack

| Layer | Technology |
|---|---|
| Framework | TanStack Start v1 (React, SSR) |
| Styling | Tailwind CSS v4 |
| State | Zustand with localStorage persistence |
| Audio | HTML5 Audio + Media Session API |
| Hosting | Cloudflare Pages |
| Audio files | Cloudflare R2 |
| Analytics DB | Cloudflare D1 (SQLite) |
| Web analytics | Cloudflare Web Analytics (auto-injected) |

---

## Development

```bash
pnpm install       # install all workspaces
pnpm dev           # start dev server (generates routeTree.gen.ts on first run)
pnpm build         # production build
pnpm check         # Biome lint + format
```

---

## Architecture notes

### Audio player
The player is a persistent fixed bar rendered in the root layout — it survives route changes. Sets play on locked mobile screens via the **Media Session API**. Audio files are streamed from Cloudflare R2 (free egress).

All playback logic lives in `apps/web/app/hooks/useAudioPlayer.ts`. `Player.tsx` is layout only.

### Play tracking
Listen events fire via `navigator.sendBeacon` (fire-and-forget, survives page close). The `/api/track` endpoint inserts into **Cloudflare D1**. Plays under 3 seconds are ignored. Play counts appear on `/sets`.

Schema: `apps/web/schema.sql`. Apply to remote DB:
```bash
npx wrangler d1 execute form-at-analytics --remote --file=apps/web/schema.sql
```

### Cloudflare Web Analytics

Privacy-first analytics — no cookies, no fingerprinting, GDPR-compliant. Auto-injected by Cloudflare for `formatglasgow.com`, no script tag needed.

Dashboard: **Cloudflare → Analytics & Logs → Web Analytics → formatglasgow.com**

**What it tracks**
- Visits and page views per route
- Core Web Vitals (LCP, INP, CLS) from real visitors
- Top pages, referrers, countries, devices, browsers
- Operating system and browser breakdown

**What it doesn't track**
- Individual user sessions or journeys (aggregate only)
- Anything requiring a cookie consent banner — that's the privacy trade-off

**Core Web Vitals — what they mean for a music site**

| Metric | What it measures | Why it matters here |
|---|---|---|
| LCP | How fast the largest visible element loads | The page should feel instant before audio starts |
| INP | Responsiveness to taps and clicks | Play button must feel immediate on mobile |
| CLS | Layout shift while loading | Player bar animating in shouldn't push content |

Good targets: LCP < 2.5s, INP < 200ms, CLS < 0.1. CF highlights these in green/amber/red.

**Filters worth using**

- **Filter by page** — compare `/sets` vs `/djs` vs `/events` to see which sections get the most attention
- **Filter by country** — useful once you start promoting to specific cities or booking international acts
- **Filter by device type** — expect heavy mobile skew; if desktop spikes after a social post, that post drove it
- **Filter by referrer** — tells you which Instagram posts, SoundCloud links, or Google searches are sending people

**Using it alongside D1 play data**

| CF Analytics tells you | D1 plays tells you |
|---|---|
| Who visited `/sets` | Who actually hit play |
| Which DJ pages get views | Which sets get listened to |
| Where traffic came from | How long people listened |
| Peak traffic times | Most replayed sets |

Patterns to watch for:
- High `/sets` visits but low play count → people are browsing but not committing. Could be slow audio load or no artwork to draw them in.
- A DJ page spikes after an event → the gig drove people to check the archive. Good signal for which artists to book again.
- High mobile traffic + poor INP → the player controls are too small or slow to respond; worth investigating.
- Traffic spike with an unknown referrer → probably a group chat or private share (shows as "direct").

---

## Roadmap

### Pending

- **Artwork on sets** — `artwork?: string` is in the `MusicSet` type and wired into the Media Session API (lock screen display), but no set has an artwork URL yet. Add event flyer URLs to `sets.ts`.
- **Mobile player track info** — title and artist are hidden on mobile. The bottom bar only shows controls and a waveform; there's no visible text saying what's playing.
- **Analytics query UI** — D1 has `started_at` and `listened_seconds` indexed but there's no internal dashboard page to query plays by date range or top tracks over time.
- **Social share image** — `og:image` currently uses the square F icon. A 1200×630 banner would give much richer link previews on Instagram, Twitter, etc.

### Longer term

- **Better Auth** — community features gated behind login. Player and sets pages stay fully public.
- **Service Worker** — offline audio caching for unreliable connections.

🔴 Critical — Image bloat - DONE                                                                                                           
                                                                                                                                        
  wordmark.png and logo.png are 9449×9449 pixels each (~360 KB). The wordmark renders at 310×44 and the logo is used as a 32×32 favicon.
   They are decoded into ~89 million pixels of memory each on every page load.                                                          
                                                                                                                                        
  Combined transfer: ~720 KB for two images that should total under 30 KB. This is bigger than the entire JS bundle gzipped, and the    
  bottleneck on first paint regardless of how good the font/preload work is.
                                                                                                                                        
  Fix: resize wordmark to ~620×88 (2× display size) and convert to WebP or AVIF. Resize logo to 64×64 max for favicon use.              
   
  🟠 Significant — Waveform redraws on every timeupdate - DONE                                                                                 
                                                               
  apps/web/app/components/Waveform.tsx:44-52 — the effect depends on [peaks, currentTime, duration]. currentTime updates ~4×/second     
  during playback. On every tick:                              
  - Canvas dimensions are reassigned (canvas.width = w * dpr) which clears the canvas                                                   
  - All peak bars are recomputed and repainted                                                                                          
                                              
  You're doing a full redraw to move a single progress line. On mobile this drains battery for nothing.                                 
                                                                                                                                        
  Fix: split into two effects — one that paints the bars when [peaks] changes, one that paints only the progress overlay on             
  [currentTime, duration]. Or paint bars once and use an absolutely-positioned <div> for the progress fill (no canvas redraw at all).   
                                                                                                                                        
  🟡 Medium — /sets loader has no staleTime - DONE                                                                                             
   
  apps/web/app/routes/sets/index.tsx:27 — every navigation to /sets re-runs fetchPlayCounts() against D1. Play counts barely change     
  minute-to-minute.                                            
                                                                                                                                        
  Fix: add staleTime: 60_000 to the route definition. TanStack Router will serve cached data within the window.                         
   
  🟡 Medium — onTimeUpdate re-renders the whole Player ~4×/sec - DONE                                                                          
                                                               
  apps/web/app/hooks/useAudioPlayer.ts:243 — setCurrentTime triggers a full Player re-render every audio tick. With only the time text  
  and waveform actually depending on it, the buttons, signal indicator, track title, etc. all re-render too.
                                                                                                                                        
  This is fine right now (the tree is small) but if the player UI grows, isolate the time-display into its own component that subscribes
   to currentTime while the rest of the bar reads only the static state.
                                                                                                                                        
  🟢 Minor — pnpm check doesn't run TypeScript - DONE                                                                                          
   
  Biome catches lint/format issues but not type errors. Add pnpm typecheck script running tsc --noEmit so CI catches type breakage      
  before deploy.                                               
                                                                                                                                        
  🟢 Minor — No bundle analyzer - DONE                                                                                                          
   
  Adding rollup-plugin-visualizer to the build would surface any unexpectedly heavy dep before it ships. Worth a 5-minute setup once you
   start adding more libraries.  