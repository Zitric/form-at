import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getSet } from "~/data/sets";
import { type PlayerSlice, createPlayerSlice } from "./playerSlice";

export type AppStore = PlayerSlice;

export const useStore = create<AppStore>()(
  persist((...a) => ({ ...createPlayerSlice(...a) }), {
    name: "format-player",
    partialize: (state) => ({
      nowPlayingId: state.nowPlaying?.id ?? null,
      lastPositionSeconds: state.lastPositionSeconds,
    }),
    merge: (persisted, current) => {
      const { nowPlayingId, lastPositionSeconds } = persisted as {
        nowPlayingId: string | null;
        lastPositionSeconds: number;
      };
      return {
        ...current,
        nowPlaying: nowPlayingId ? (getSet(nowPlayingId) ?? null) : null,
        lastPositionSeconds: lastPositionSeconds ?? 0,
      };
    },
  }),
);
