---
paths:
  - "apps/web/app/utils/storyVideo/**"
  - "apps/web/app/utils/djStory/**"
  - "apps/web/app/components/story/**"
  - "apps/web/app/components/djStory/**"
  - "apps/web/app/components/ShareModal.tsx"
  - "apps/web/app/utils/storyFlag.ts"
  - "apps/web/app/utils/storyAvailability.ts"
  - "apps/web/app/utils/nextEventLabel.ts"
  - "spikes/instagram-story/**"
---

# Instagram Story video and DJ Story image

## Never flatten a `lazy(() => import(...))` into a static import

`StoryVideoFlow` and `StoryInstallGate` (both in `components/story/StoryFlowHost.tsx`)
and `DjStorySheet` (in `components/djStory/DjStoryHost.tsx`) are lazy.
`ClientOnly` is a render guard, not a code-splitting mechanism. A static
top-level import still renders correctly while pulling the Story video's MP3
reader, spectrum, renderer and recorder into every visitor's main bundle, or the
DJ Story image's renderer into every DJ page. The gate is lazy for a less obvious
reason: it reuses `SaveGateModal` and `InstallInstructions`, which otherwise live
in the set page's chunks, and a static import from the root host moved them into
the main bundle (+~7KB, found by comparing builds). Silent bundle regression, no
test failure. The same goes for importing anything under `utils/storyVideo/` from
always-loaded code: the entry's capability check lives in `capability.ts`
precisely so ShareModal doesn't import `recorder.ts`.

## Instagram Story video

- **Entry and gate:** `apps/web/app/components/story/StoryEntry.tsx`, `StoryInstallGate.tsx`.
- **Flow:** `StoryFlowHost.tsx` (lazy), `StoryVideoFlow.tsx` (picker + create), `StoryCreateScreens.tsx`.
- **Logic:** `app/utils/storyVideo/`:
  - `mp3Excerpt`: byte-range excerpt, CBR only.
  - `excerptWindow`: picker arithmetic, incl. `finePeaksStrip`. The zoomed strip draws from the set's `peaks-fine.bin` when it has one and from the decoded slice otherwise; fetched bare and never saved offline.
  - `renderer`/`spectrum`/`layout`: the frame. `layout` also places the background artwork so its colon sits behind the card.
  - `canvas`: canvas, image and font helpers shared with the DJ Story image, including `drawWordmark`. It may import only `layout`, which holds the shared `WORDMARK` and `SITE`.
  - `storyImages`: artwork and DJ photo URLs; no DJ or no photo → the artwork in the card.
  - `recorder`.
  - `remux`: rewrites MediaRecorder's fragmented MP4 as a non-fragmented one with mediabunny, in its own lazy chunk. A fragmented file made Instagram keep only its first seconds.
  - `createFlow`: phases + events.
  - `capability`.
- **Availability:** live on Android phones, behind `?story=on` (`utils/storyFlag.ts`) everywhere else. Who sees the entry, and the Android rollback switch (`STORY_LAUNCHED_ON_ANDROID`), are in `utils/storyAvailability.ts`. Phones only, made in the installed app only.
- **Design reference and device results:** TECH_DEBT.md item 30 and `layout.ts` (the approved layout; `spikes/instagram-story/`'s header records the first version).
- **Never touches the player's `<audio>`.** The excerpt is decoded separately, which is also why it works without `HTMLMediaElement.captureStream()`.
- **Recorder test** needs real encoders, hence ci.yml's macOS job.
- **Precache exclusion:** the picker and remux chunks are excluded from the SW precache by filename in `vite.config.ts`'s `shouldPrecache`. Renaming either module silently precaches it again.
- **Deferred follow-ups:** IMPROVEMENTS.md #13.

## DJ Story image

- **Entry:** the share modal's `instagram:` section on a DJ page (`components/ShareModal.tsx`, `[ image_story ]`, first in the modal; the DJ share target carries the DJ and their next night). It copies the page link in the tap and calls the store's `openDjStory`.
- **Host and sheet:** `apps/web/app/components/djStory/DjStoryHost.tsx` (mounted at the root, lazy-loads the sheet), `DjStorySheet.tsx` (canvas preview, treatment chips, share / download).
- **Renderer:** `app/utils/djStory/renderDjStory.ts`:
  - Layout `DJ_STORY`: the shared wordmark, a card across the content width, then name, line and site as one block, all inside `SAFE_ZONE`.
  - `TREATMENTS`: form:at and raw only.
  - Drawing, JPEG export.
- **Next-event text:** comes from `utils/nextEventLabel.ts`, shared with the page's next row.
- **Availability:** for everyone, tab or installed app; a still needs no recording.
- **Share timing:** the sheet renders before the share tap, so `navigator.share` runs inside the tap's user activation.
- **Preview:** the canvas itself, because the CSP's `img-src` refuses `blob:`.
- **Backgrounds** are blurred by downscaling, not `ctx.filter` (Safari only got canvas filters in 18), so no lettering in a photo stays legible behind the text.
- **Imports:** keep the sheet lazy, and its renderer importing only `storyVideo/layout` and `storyVideo/canvas`.
- **Events:** `dj_story_open` / `_shared` / `_downloaded`, no id.
- **Follow-ups:** IMPROVEMENTS.md #14.

## Product decisions

- **The DJ Story ships with two treatments, form:at and raw.** A countdown treatment was built and dropped; don't re-propose it.
- **Still open, all of them:** other effects, a lineup Story, vignette/focus, a gold frame, a giant name behind the DJ, a photo of the three DJs on the night.
- **Share modal:** `instagram:` comes first, with `[ video_story ]` on a set and `[ image_story ]` on a DJ, above `link:` and `send:`.
- **Analytics event names stay as they are** (`story_*`, `dj_story_*`), even when labels change, so the admin history doesn't split.
- **Story renders for review:**
  - Each treatment for Dzeko, Julz Lever and Brandon Lee Vear.
  - Set frames for 003 and Seafield.
  - See `/visual-review`.
