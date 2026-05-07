import type { StateCreator } from "zustand";
import type { MusicSet } from "~/data/sets";

export type PlayerSlice = {
  nowPlaying: MusicSet | null;
  isPlaying: boolean;
  lastPositionSeconds: number;
  loadTrack: (set: MusicSet) => void;
  setIsPlaying: (playing: boolean) => void;
  setLastPosition: (seconds: number) => void;
};

export const createPlayerSlice: StateCreator<PlayerSlice, [], [], PlayerSlice> = (set) => ({
  nowPlaying: null,
  isPlaying: false,
  lastPositionSeconds: 0,
  loadTrack: (track) => set({ nowPlaying: track, isPlaying: false, lastPositionSeconds: 0 }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setLastPosition: (seconds) => set({ lastPositionSeconds: seconds }),
});
