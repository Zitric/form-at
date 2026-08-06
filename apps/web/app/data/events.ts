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
  // Optional free-text note, same shape/purpose as MusicSet's `description?`
  // (sets.ts) — most events won't need one (the auto-built meta description
  // in $eventId.tsx covers the generic case). Use it when there's context a
  // visitor can't get from the structured fields alone — e.g. a co-organized
  // event where some lineup names have no Form:at DJ profile.
  description?: string;
};

export const events: Event[] = [
  {
    id: "format-003",
    title: "Form:at 003",
    date: "2026-08-28",
    venue: "Southside, Glasgow",
    lineupIds: ["unreal"],
    audio: "techno / electro / dub",
    runtime: "23:00 — 05:00",
    status: "upcoming",
  },
  {
    id: "seafield-sound",
    title: "Seafield Sound",
    date: "2026-07-24",
    venue: "Seafield road beach spot, Edinburgh",
    lineupIds: ["julz-lever", "hubey", "til", "angel-negrin", "rushford", "dimebug", "3sr"],
    audio: "electro / house / techno",
    runtime: "20:30 — very late",
    status: "past",
    flyer: "events/seafield-sound",
    description:
      "a joint transmission — form:at is one node in this crew, not the sole operator. on the sand at seafield road; if weather breaks, a covered plan b stands 100m inland. this year's rig hits harder than last year's.",
  },
  {
    id: "format-002",
    title: "Form:at 002",
    date: "2026-04-24",
    venue: "Southside, Glasgow",
    lineupIds: ["brandon-lee-vear", "julz-lever", "hubey", "til"],
    audio: "techno / electro / dub",
    runtime: "23:00 — 05:00",
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
    runtime: "23:00 — 05:00",
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
