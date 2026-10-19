import { type Event, getVenueName } from "@form-at/data/events";
import { fmtEventDay } from "./fmt";

// An upcoming event in two lengths, lowercase like the terminal rows: the DJ
// page's "next" row and the DJ Story image.
// Short: "004 · sat 05.12" (the event number; a title without the "Form:at "
// prefix is kept whole). Long: "form:at 004 · sat 05.12 · stereo", the venue's
// name without its city.
export function nextLabelShort(event: Event): string {
  const number = event.title.replace(/^Form:at\s+/i, "");
  return `${number} · ${fmtEventDay(event.date)}`.toLowerCase();
}

export function nextLabelLong(event: Event): string {
  return `${event.title} · ${fmtEventDay(event.date)} · ${getVenueName(event)}`.toLowerCase();
}
