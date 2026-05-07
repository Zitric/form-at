import type { StateCreator } from "zustand";
import type { MusicSet } from "~/data/sets";

export type PlayerSlice = {
  nowPlaying: MusicSet | null;
  isPlaying: boolean;
  positions: Record<string, number>;
  peaksCache: Record<string, number[]>;
  durations: Record<string, number>;
  loadTrack: (set: MusicSet) => void;
  setIsPlaying: (playing: boolean) => void;
  setLastPosition: (setId: string, seconds: number) => void;
  setPeaks: (setId: string, peaks: number[]) => void;
  setTrackDuration: (setId: string, seconds: number) => void;
};

export const createPlayerSlice: StateCreator<PlayerSlice, [], [], PlayerSlice> = (set) => ({
  nowPlaying: null,
  isPlaying: false,
  positions: {},
  peaksCache: {},
  durations: {},
  loadTrack: (track) => set({ nowPlaying: track, isPlaying: false }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setLastPosition: (setId, seconds) =>
    set((s) => ({ positions: { ...s.positions, [setId]: seconds } })),
  setPeaks: (setId, peaks) => set((s) => ({ peaksCache: { ...s.peaksCache, [setId]: peaks } })),
  setTrackDuration: (setId, seconds) =>
    set((s) => ({ durations: { ...s.durations, [setId]: seconds } })),
});
