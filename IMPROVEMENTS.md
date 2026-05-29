# Form:at — Improvements

Running list of feature/functional improvements. Tick off as we ship.

## Quick wins

- [x] **#1 — Autoplay next set on end**
  Already implemented in `apps/web/app/hooks/useAudioPlayer.ts` (`onEnded`). When a set ends, the player advances to the next set in `sets[]` and starts playback.

- [ ] **#2 — Sharing (deeplink timestamps + share button)**
  Goal: match the SoundCloud/Mixcloud sharing pattern so listeners actively pass sets around.
  - `?t=<seconds>` URL support: `/sets/<id>?t=1234` jumps to that moment on play.
  - `ShareSetButton` on the set detail page using `navigator.share()` (native OS share sheet) with a clipboard fallback.
  - "Share @ MM:SS" secondary button when the set is currently playing — pre-fills the timestamp.
  - Later: small share icon in the player bar so listeners can share without leaving the audio.

- [ ] **#3 — Continue listening card on home**
  We already persist `nowPlayingId` + `positions`. Surface a top card on `/` that resumes the last set in one tap when those are present.

- [ ] **#4 — Add to calendar on events**
  Generate `.ics` from `event.date / runtime / venue`. One small button: `[ add_to_calendar ]`.

## Medium lift, high engagement

- [ ] **#5 — Tracklist / chapters on set pages**
  Add `tracks: [{ time, artist, title }]` to `MusicSet`. Render clickable rows that seek to that moment. Industry standard for DJ mixes; big dwell-time boost.

- [ ] **#6 — Sleep timer + speed control**
  Player additions: 15/30/60-min sleep, 0.75x/1x/1.25x speed. Common asks for long mixes.

- [ ] **#7 — "Shuffle the archive" / random set**
  One button on `/sets` (and maybe `/`) that picks a random set and plays it. Fits the explore vibe.

## Bigger but worth it

- [ ] **#8 — PWA offline caching**
  Manifest is already in place. Add a service worker that caches sets (R2 audio + artwork) for offline listening on the train.

- [ ] **#9 — Per-DJ stats**
  Aggregate plays and top territories on `/djs/:id`. D1 already has the data — just a new server fn.
