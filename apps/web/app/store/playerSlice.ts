import type { StateCreator } from "zustand";
import type { MusicSet } from "~/data/sets";

export type PlayerSlice = {
  nowPlaying: MusicSet | null;
  isPlaying: boolean;
  positions: Record<string, number>;
  loadTrack: (set: MusicSet) => void;
  setIsPlaying: (playing: boolean) => void;
  setLastPosition: (setId: string, seconds: number) => void;
};

export const createPlayerSlice: StateCreator<PlayerSlice, [], [], PlayerSlice> = (set) => ({
  nowPlaying: null,
  isPlaying: false,
  positions: {},
  loadTrack: (track) => set({ nowPlaying: track, isPlaying: false }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setLastPosition: (setId, seconds) =>
    set((s) => ({ positions: { ...s.positions, [setId]: seconds } })),
});
