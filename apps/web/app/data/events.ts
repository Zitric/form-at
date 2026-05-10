export type Event = {
  id: string;
  title: string;
  date: string; // ISO: "2026-02-06"
  venue: string;
  lineupIds: string[]; // DJ ids, headline first
  audio: string;
  runtime: string;
  status: "upcoming" | "past";
  flyer?: string;
};

export const events: Event[] = [
  {
    id: "format-002",
    title: "Form:at 002",
    date: "2026-04-24",
    venue: "Southside, Glasgow",
    lineupIds: ["brandon-lee-vear", "julz-lever", "hubey", "til"],
    audio: "techno / electro / dub",
    runtime: "23:00 — 04:00",
    status: "past",
    flyer: "events/002",
  },
  {
    id: "format-001",
    title: "Form:at 001",
    date: "2026-02-06",
    venue: "Southside, Glasgow",
    lineupIds: ["angel-negrin", "julz-lever", "hubey"],
    audio: "techno / electro / dub",
    runtime: "23:00 — 04:00",
    status: "past",
    flyer: "events/001",
  },
];

export function getEvent(id: string): Event | undefined {
  return events.find((e) => e.id === id);
}

export function getUpcomingEvents(): Event[] {
  return events.filter((e) => e.status === "upcoming");
}

export function getPastEvents(): Event[] {
  return events.filter((e) => e.status === "past");
}
