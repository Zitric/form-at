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
      positions: state.positions,
    }),
    merge: (persisted, current) => {
      const { nowPlayingId, positions } = persisted as {
        nowPlayingId: string | null;
        positions: Record<string, number>;
      };
      return {
        ...current,
        nowPlaying: nowPlayingId ? (getSet(nowPlayingId) ?? null) : null,
        positions: positions ?? {},
      };
    },
  }),
);
