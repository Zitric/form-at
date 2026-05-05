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
    id: "set-002-til",
    title: "FORM:AT 002",
    artist: "t.i.l.",
    date: "2026-04-24",
    src: "https://pub-e15e86da649d4c91b6666141bfe67664.r2.dev/002/Form_at%20002%20-%20t.i.l.mp3",
  },
  {
    id: "set-002-hubey",
    title: "FORM:AT 002",
    artist: "Hubey",
    date: "2026-04-24",
    src: "https://pub-e15e86da649d4c91b6666141bfe67664.r2.dev/002/Form_at%20002%20-%20hubey.mp3",
  },
];

export function getSet(id: string): Set | undefined {
  return sets.find((s) => s.id === id);
}
