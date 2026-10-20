import { type Event, getVenueName } from "@form-at/data/events";
import { fmtEventDay } from "./fmt";

// An upcoming event in two lengths, lowercase like the terminal rows: the DJ
// page's "next" row and the DJ Story image.
// Short: "004 · sat 05.12" (the event number; a title without the "Form:at "
// prefix is kept whole), or with `venue`, "004 · sat 05.12 · stereo" (the
// DJ Story image, where the wordmark already says Form:at). Long:
// "form:at 004 · sat 05.12 · stereo". The venue is its name without its city.
export function nextLabelShort(event: Event, { venue = false } = {}): string {
  const number = event.title.replace(/^Form:at\s+/i, "");
  const parts = [number, fmtEventDay(event.date), ...(venue ? [getVenueName(event)] : [])];
  return parts.join(" · ").toLowerCase();
}

export function nextLabelLong(event: Event): string {
  return `${event.title} · ${fmtEventDay(event.date)} · ${getVenueName(event)}`.toLowerCase();
}
