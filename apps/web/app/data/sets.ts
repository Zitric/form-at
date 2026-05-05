export type Set = {
  id: string;
  title: string;
  artist: string;
  date: string;
  venue?: string;
  description?: string;
  duration?: string;
  src: string;
  artwork?: string;
};

// Add your sets here. src should be the public Cloudflare R2 URL for the MP3.
export const sets: Set[] = [
  {
    id: "set-001",
    title: "Breathwork (Original Mix)",
    artist: "Alkem, Biereda",
    date: "2026-05-05",
    src: "https://pub-e15e86da649d4c91b6666141bfe67664.r2.dev/2-5.%20Alkem%2C%20Biereda%20-%20Breathwork%20(Original%20Mix).mp3",
  },
];

export function getSet(id: string): Set | undefined {
  return sets.find((s) => s.id === id);
}
