import type { MusicSet } from "@form-at/data/sets";
import type { StateCreator } from "zustand";
import { withAppContext } from "~/utils/audioUrl";
import { isStandalone } from "~/utils/installCapability";
// Type-only — no runtime import. Lets the gate in `playTrack` read
// `state.offlineSets` without casting or going through `useStore.getState()`
// (which would be a circular import via `~/store`).
import type { OfflineSlice } from "./offlineSlice";

// Module-level reference to the <audio> element. Registered by Player.tsx on mount.
// Click handlers go through actions on this slice that touch this element synchronously,
// so audio.play() runs inside the user-gesture stack frame. Mobile browsers (Safari iOS,
// Chrome Android) require this — calling play() asynchronously after a state update
// → effect → canplay listener loses the gesture token and play() rejects silently.
let audioEl: HTMLAudioElement | null = null;
export function registerAudioElement(el: HTMLAudioElement | null) {
  audioEl = el;
}
export function getAudioCurrentTime() {
  return audioEl?.currentTime ?? 0;
}

// Distinguishes "audio element rejected play()" (the existing `hasError` flag)
// from "we deliberately refused to start playback because the bytes aren't
// available offline" (these reasons). The retry-storm gate in `playTrack`
// surfaces the latter; `PlaybackErrorToast` branches for the right copy.
//
//   not-saved-offline       — standalone PWA, offline, set not in IDB. App
//                             user understands "saved", so we say so.
//   tab-offline-needs-network — browser tab (no IDB read-path active), offline.
//                             Tab users have no concept of "saved" — point
//                             them at the app instead.
//   null                    — generic playback failure (audio element rejected
//                             play() for some other reason — network blip on
//                             a streamable set, decode error, etc.).
// Not exported — consumers (e.g. PlaybackErrorToast) read the VALUE via
// `useStore((s) => s.playbackBlockedReason)` with inferred typing; nothing
// imports this type name directly.
type PlaybackBlockedReason = "not-saved-offline" | "tab-offline-needs-network" | null;

// THE offline playback gate predicate — one predicate, every play path.
// True when starting/resuming this track can actually get bytes: either
// we're online, or we're a standalone PWA with the track saved in IDB (the
// only context the SW serves IDB to — see sw.ts's tab-vs-app gate).
// Environment reads only (navigator.onLine, display-mode) — no React, no
// store; exported for unit tests and for any future play-path writer.
export function canFetchPlaybackBytes(
  trackId: string,
  offlineSets: Record<string, { status: string }> | undefined,
): boolean {
  const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
  if (!isOffline) return true;
  return isStandalone() && offlineSets?.[trackId]?.status === "saved";
}

// Mirrors the EXACT condition the SW audio route uses to decide IDB-vs-network
// (sw.ts's registerRoute handler) — change one and you must change the other.
// IDB is read whenever `ctx=app` is set AND an entry exists, REGARDLESS of
// navigator.onLine, so a saved set in the standalone app is served from IDB
// even while online. Deliberately NOT the same predicate as
// `canFetchPlaybackBytes` above, which short-circuits true whenever online.
//
// `withAppContext` sets `?ctx=app` only when `isStandalone()` is true, so
// that's the client-side mirror of the SW's own check.
//
// Populates the `plays.is_offline` analytics column — best-effort: relies on
// `offlineSets` staying in sync with
// real IDB contents via `reconcileFromIdb`, the same tolerance the rest of
// the app already accepts for this state.
export function wasServedFromIdb(
  trackId: string,
  offlineSets: Record<string, { status: string }> | undefined,
): boolean {
  return isStandalone() && offlineSets?.[trackId]?.status === "saved";
}

// App users have the vocabulary of "saved"; tab users don't (tabs never
// read IDB, so downloaded-vs-not is invisible from the web) — point them
// at the app instead.
function blockedPlaybackReason(): PlaybackBlockedReason {
  return isStandalone() ? "not-saved-offline" : "tab-offline-needs-network";
}

export type PlayerSlice = {
  nowPlaying: MusicSet | null;
  isPlaying: boolean;
  hasError: boolean;
  playbackBlockedReason: PlaybackBlockedReason;
  positions: Record<string, number>;
  peaksCache: Record<string, number[]>;
  durations: Record<string, number>;
  loadTrack: (set: MusicSet) => void;
  playTrack: (set: MusicSet, opts?: { startTime?: number }) => void;
  togglePlay: () => void;
  resumePlayback: () => void;
  setIsPlaying: (playing: boolean) => void;
  setHasError: (hasError: boolean) => void;
  setLastPosition: (setId: string, seconds: number) => void;
  setPeaks: (setId: string, peaks: number[]) => void;
  setTrackDuration: (setId: string, seconds: number) => void;
};

export const createPlayerSlice: StateCreator<PlayerSlice & OfflineSlice, [], [], PlayerSlice> = (
  set,
  get,
) => ({
  nowPlaying: null,
  isPlaying: false,
  hasError: false,
  playbackBlockedReason: null,
  positions: {},
  peaksCache: {},
  durations: {},

  loadTrack: (track) =>
    set({ nowPlaying: track, isPlaying: false, hasError: false, playbackBlockedReason: null }),

  playTrack: (track, opts) => {
    const audio = audioEl;
    const state = get();
    const override = opts?.startTime;
    if (!audio) return;

    // Retry-storm gate (TECH_DEBT 11) — unified for BOTH branches below.
    //
    // The invariant: if this tap would START or RESUME playback of a track
    // whose bytes we can't reach offline, refuse. That covers new-track
    // (would attach a fresh src that can't be fetched) AND same-track
    // resume (would call audio.play() on a partially-buffered src, spawning
    // Range fetches that fail → `<audio>` retries dozens of times).
    //
    // The one action still allowed when gated: PAUSING a currently-playing
    // same-track. `audio.pause()` never fetches — blocking it would trap
    // the user with a stalled stream. Everything else (start new, resume
    // paused same-track, seek same-track) needs bytes.
    //
    // Reactivity to online/offline isn't needed here: a synchronous check
    // at click time is the right semantics.
    //
    // Keep this ONE gate ahead of the same-track/new-track split rather than
    // duplicating it into each branch — a per-branch gate is how the
    // same-track resume path went unprotected before (PWA_PROGRESS.md row 5.2).
    const isSameTrack = state.nowPlaying?.id === track.id;
    const isCurrentlyPlaying = isSameTrack && !audio.paused;
    const isPauseAction = isCurrentlyPlaying && override === undefined;
    // `offlineSets?.` inside the predicate tolerates tests that instantiate
    // createPlayerSlice in isolation (without composing offlineSlice) — in
    // real prod use the slice is always composed.
    //
    // Web tabs never read IDB (SW gates on `?ctx=app` — see `withAppContext`),
    // so a "saved" set is still unreachable offline in a tab; only a
    // standalone PWA can serve saved bytes from IDB. The predicate owns that
    // invariant (see `canFetchPlaybackBytes` above) — a previous revision
    // let tab+saved+offline skip the gate, which fell through to
    // `audio.play()` → network fetch fails → generic playback_error.
    if (!canFetchPlaybackBytes(track.id, state.offlineSets) && !isPauseAction) {
      set({ hasError: true, playbackBlockedReason: blockedPlaybackReason(), isPlaying: false });
      return;
    }

    // Same track already loaded — seek if a startTime was provided, otherwise
    // toggle. Resume goes through `resumePlayback` (the single gated resume
    // writer); the extra predicate check inside it is idempotent.
    if (isSameTrack) {
      if (override !== undefined) audio.currentTime = override;
      if (audio.paused) {
        get().resumePlayback();
      } else if (override === undefined) {
        audio.pause();
        set({ isPlaying: false });
      }
      return;
    }

    // New track. Set src + call play() in the SAME synchronous block as the click —
    // this is what preserves the user-gesture token on mobile. Apply the resume
    // position once metadata loads (slightly delayed but seamless). `opts.startTime`
    // overrides the saved position so timestamp deeplinks (?t=...) work.
    const startPos = override ?? state.positions[track.id] ?? 0;
    // `withAppContext` re-reads `isStandalone()` per call, so a display-
    // mode flip between tracks is naturally reflected on the next play.
    audio.src = withAppContext(track.src);
    // Identity stamp — the invariant `useAudioPlayer`'s main effect keys
    // on to skip re-loading a track the click path already attached.
    // Comparing track IDs (rather than URL strings) is immune to the
    // `?ctx=app` marker AND to any Chrome URL-normalization drift; the
    // marker-based URL comparison a previous revision used could ping-
    // pong between marked and unmarked forms on cross-track transitions.
    // MUST be kept in sync with the same stamp in `useAudioPlayer`'s
    // restore-path src assignment — both writers, one invariant.
    audio.dataset.trackId = track.id;
    if (startPos > 0) {
      const applySeek = () => {
        if (get().nowPlaying?.id === track.id) {
          audio.currentTime = startPos;
        }
      };
      if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
        applySeek();
      } else {
        audio.addEventListener("loadedmetadata", applySeek, { once: true });
      }
    }
    audio
      .play()
      .then(() => set({ isPlaying: true, hasError: false, playbackBlockedReason: null }))
      .catch(() => set({ isPlaying: false, hasError: true }));
    set({ nowPlaying: track, hasError: false, playbackBlockedReason: null });
  },

  // THE single gated resume writer. Every "make paused audio play
  // again" path — player-bar button, Space, lock-screen Media Session,
  // scrub-release, the isPlaying bridge — funnels here, so the offline gate
  // is impossible to bypass by construction. Only `playTrack`'s NEW-track
  // branch calls audio.play() elsewhere (a start, not a resume, and it sits
  // behind the same predicate). Pausing is deliberately NOT in here and
  // never gated: audio.pause() fetches nothing.
  resumePlayback: () => {
    const audio = audioEl;
    const track = get().nowPlaying;
    if (!audio || !track) return;
    if (!audio.paused) return;
    if (!canFetchPlaybackBytes(track.id, get().offlineSets)) {
      // Same feedback contract as the tap-time gate: reason set →
      // PlaybackErrorToast renders (it works trackless, and here a track is
      // always attached anyway). isPlaying: false keeps
      // store and element agreeing, so the bridge effect has nothing to
      // re-trigger on.
      set({ hasError: true, playbackBlockedReason: blockedPlaybackReason(), isPlaying: false });
      return;
    }
    audio
      .play()
      .then(() => set({ isPlaying: true, hasError: false, playbackBlockedReason: null }))
      .catch(() => set({ isPlaying: false, hasError: true }));
  },

  togglePlay: () => {
    const audio = audioEl;
    if (!audio) return;
    if (audio.paused) {
      get().resumePlayback();
    } else {
      audio.pause();
      set({ isPlaying: false });
    }
  },

  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setHasError: (hasError) => set({ hasError }),
  setLastPosition: (setId, seconds) =>
    set((s) => ({ positions: { ...s.positions, [setId]: seconds } })),
  setPeaks: (setId, peaks) => set((s) => ({ peaksCache: { ...s.peaksCache, [setId]: peaks } })),
  setTrackDuration: (setId, seconds) =>
    set((s) => ({ durations: { ...s.durations, [setId]: seconds } })),
});
