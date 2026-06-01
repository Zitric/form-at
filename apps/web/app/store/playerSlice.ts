import type { StateCreator } from "zustand";
import type { MusicSet } from "~/data/sets";

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

export type PlayerSlice = {
  nowPlaying: MusicSet | null;
  isPlaying: boolean;
  hasError: boolean;
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

export const createPlayerSlice: StateCreator<PlayerSlice, [], [], PlayerSlice> = (set, get) => ({
  nowPlaying: null,
  isPlaying: false,
  hasError: false,
  positions: {},
  peaksCache: {},
  durations: {},

  loadTrack: (track) => set({ nowPlaying: track, isPlaying: false, hasError: false }),

  playTrack: (track, opts) => {
    const audio = audioEl;
    const state = get();
    const override = opts?.startTime;

    // Same track already loaded — seek if a startTime was provided, otherwise toggle.
    if (state.nowPlaying?.id === track.id && audio) {
      if (override !== undefined) audio.currentTime = override;
      if (audio.paused) {
        audio
          .play()
          .then(() => set({ isPlaying: true, hasError: false }))
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
        .then(() => set({ isPlaying: true, hasError: false }))
        .catch(() => set({ isPlaying: false, hasError: true }));
    }
    set({ nowPlaying: track, hasError: false });
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
