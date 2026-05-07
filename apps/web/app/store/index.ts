import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getSet } from "~/data/sets";
import { type PlayerSlice, createPlayerSlice } from "./playerSlice";

export type AppStore = PlayerSlice;

export const useStore = create<AppStore>()(
  persist((...a) => ({ ...createPlayerSlice(...a) }), {
    name: "format-player",
    // Wait until <HydrateStore> mounts before reading localStorage. Without this,
    // SSR (no localStorage → empty) and the first client render (synchronous
    // localStorage read → restored track) disagree, and React's reconciliation
    // produces a visible re-render of the player.
    skipHydration: true,
    partialize: (state) => ({
      nowPlayingId: state.nowPlaying?.id ?? null,
      positions: state.positions,
      peaksCache: state.peaksCache,
      durations: state.durations,
    }),
    merge: (persisted, current) => {
      const { nowPlayingId, positions, peaksCache, durations } = persisted as {
        nowPlayingId: string | null;
        positions: Record<string, number>;
        peaksCache: Record<string, number[]>;
        durations: Record<string, number>;
      };
      return {
        ...current,
        nowPlaying: nowPlayingId ? (getSet(nowPlayingId) ?? null) : null,
        positions: positions ?? {},
        peaksCache: peaksCache ?? {},
        durations: durations ?? {},
      };
    },
  }),
);
