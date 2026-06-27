import type { StateCreator } from "zustand";
import type { MusicSet } from "~/data/sets";
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
// available offline" (this reason). The retry-storm gate in `playTrack`
// surfaces the latter; `PlaybackErrorToast` branches on it for the right copy.
// `null` when the error is the generic playback failure.
export type PlaybackBlockedReason = "not-saved-offline" | null;

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

    // Same track already loaded — seek if a startTime was provided, otherwise toggle.
    // Same-track path is always allowed: the src is already attached (from an
    // online context) and `<audio>` toggling won't spawn the retry storm that
    // the offline-unsaved gate below exists to prevent.
    if (state.nowPlaying?.id === track.id && audio) {
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

    // Retry-storm gate (TECH_DEBT 11): if we're offline and the track isn't
    // saved to IDB, refuse to attach `audio.src`. Without this, `<audio>`
    // fires dozens of retries on the failing source. We don't even flip
    // `nowPlaying` — the player UI shouldn't promote a track it can't play.
    // The surfacing happens via `PlaybackErrorToast`'s branch on
    // `playbackBlockedReason`. Reactivity to online/offline isn't needed
    // here: a synchronous check at click time is the right semantics.
    const isOffline = typeof navigator !== "undefined" && navigator.onLine === false;
    // `offlineSets?.` rather than `offlineSets.` so tests that instantiate
    // createPlayerSlice in isolation (without composing offlineSlice) don't
    // crash here — in real prod use the slice is always composed.
    const offlineStatus = state.offlineSets?.[track.id]?.status;
    if (isOffline && offlineStatus !== "saved") {
      set({ hasError: true, playbackBlockedReason: "not-saved-offline", isPlaying: false });
      return;
    }

    // New track. Set src + call play() in the SAME synchronous block as the click —
    // this is what preserves the user-gesture token on mobile. Apply the resume
    // position once metadata loads (slightly delayed but seamless). `opts.startTime`
    // overrides the saved position so timestamp deeplinks (?t=...) work.
    if (audio) {
      const startPos = override ?? state.positions[track.id] ?? 0;
      audio.src = track.src;
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
    }
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
