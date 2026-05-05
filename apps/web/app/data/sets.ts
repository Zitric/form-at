export type Set = {
  id: string;
  title: string;
  artist: string;
  date: string;
  duration?: string;
  src: string;
  artwork?: string;
};

// Replace src URLs with your actual Cloudflare R2 bucket URLs
export const sets: Set[] = [
  {
    id: "set-001",
    title: "Form:at 001",
    artist: "TBA",
    date: "2024-01-01",
    duration: "1:00:00",
    src: "https://your-bucket.r2.dev/set-001.mp3",
  },
];

export function getSet(id: string): Set | undefined {
  return sets.find((s) => s.id === id);
}
