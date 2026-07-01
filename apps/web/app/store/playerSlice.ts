import type { StateCreator } from "zustand";
import type { MusicSet } from "~/data/sets";
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
export type PlaybackBlockedReason = "not-saved-offline" | "tab-offline-needs-network" | null;

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
    // A previous revision put this gate ONLY in the new-track branch. The
    // same-track branch had no gate, so re-tapping a paused non-saved set
    // offline (played online, paused, went offline, tapped again) still
    // spawned the retry storm. The single unified gate below closes that
    // gap by construction — impossible for one branch to be protected while
    // the other isn't.
    const isSameTrack = state.nowPlaying?.id === track.id;
    const isCurrentlyPlaying = isSameTrack && !audio.paused;
    const isPauseAction = isCurrentlyPlaying && override === undefined;
    const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
    // `offlineSets?.` rather than `offlineSets.` so tests that instantiate
    // createPlayerSlice in isolation (without composing offlineSlice) don't
    // crash here — in real prod use the slice is always composed.
    const offlineStatus = state.offlineSets?.[track.id]?.status;
    // Web tabs never read IDB (SW gates on `?ctx=app` — see `withAppContext`),
    // so a "saved" set is still unreachable offline in a tab. Only a
    // standalone PWA can serve saved bytes from IDB. `canReadOfflineBytes`
    // names that exact invariant so a future reader can't confuse "the set
    // is persisted saved in state" with "the current context can actually
    // read it." A previous revision let tab+saved+offline skip the gate,
    // which fell through to `audio.play()` → network fetch fails → generic
    // playback_error — telling a web user "tap to retry" for a set the tab
    // can never load offline. Blocking here shows the correct "open the app"
    // message via the reason branch below.
    const canReadOfflineBytes = isStandalone() && offlineStatus === "saved";
    const cannotFetch = isOffline && !canReadOfflineBytes;
    if (cannotFetch && !isPauseAction) {
      // App-aware copy ("not saved for offline listening") in standalone
      // — the app user has the vocabulary of "saved." Tab-aware copy
      // ("open the app to listen offline") in a browser tab, uniform
      // across downloaded-in-the-app and never-downloaded sets: from the
      // web, downloaded-vs-not is irrelevant because the tab can't read
      // IDB either way.
      const reason: PlaybackBlockedReason = isStandalone()
        ? "not-saved-offline"
        : "tab-offline-needs-network";
      set({ hasError: true, playbackBlockedReason: reason, isPlaying: false });
      return;
    }

    // Same track already loaded — seek if a startTime was provided, otherwise
    // toggle. Reached only when the gate above allowed us through, so any
    // audio.play() here is safe to attempt.
    if (isSameTrack) {
      if (override !== undefined) audio.currentTime = override;
      if (audio.paused) {
        audio
          .play()
          .then(() => set({ isPlaying: true, hasError: false, playbackBlockedReason: null }))
          .catch(() => set({ isPlaying: false, hasError: true }));
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

  togglePlay: () => {
    const audio = audioEl;
    if (!audio) return;
    if (audio.paused) {
      audio
        .play()
        .then(() => set({ isPlaying: true, hasError: false }))
        .catch(() => set({ isPlaying: false, hasError: true }));
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
