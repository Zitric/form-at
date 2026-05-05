import { type ReactNode, createContext, useContext, useState } from "react";
import type { MusicSet } from "~/data/sets";

type PlayerContextValue = {
  nowPlaying: MusicSet | null;
  loadTrack: (track: MusicSet) => void;
};

const PlayerContext = createContext<PlayerContextValue | null>(null);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const [nowPlaying, setNowPlaying] = useState<MusicSet | null>(null);
  const loadTrack = (track: MusicSet) => setNowPlaying(track);

  return (
    <PlayerContext.Provider value={{ nowPlaying, loadTrack }}>{children}</PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}
