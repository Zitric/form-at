import type { DJ } from "@form-at/data/djs";
import { type Event, getCityForSet, getVenueName } from "@form-at/data/events";
import type { MusicSet } from "@form-at/data/sets";
import { fmtEventDay } from "./fmt";

// What ShareModal shares. Every kind gets copy_link, apps (navigator.share),
// whatsapp and telegram from `url` / `title` / `text`. A set and a DJ also
// carry what their instagram: section needs: the set for copy @ <timestamp>
// (the playing position) and the set Story video; the DJ and their next
// night for the DJ Story image.
//
//   set   — a set page, /sets/<id>
//   dj    — a DJ page, /djs/<id>
//   event — an event page, /events/<id>
export type ShareTarget =
  | { kind: "set"; set: MusicSet; url: string; title: string; text: string }
  | {
      kind: "dj";
      dj: DJ;
      nextEvent: Event | null;
      url: string;
      title: string;
      text: string;
    }
  | { kind: "event"; url: string; title: string; text: string };

// Built on a tap, so `window` is there; the default keeps callers short.
const currentOrigin = () => (typeof window !== "undefined" ? window.location.origin : "");

export function setShareTarget(set: MusicSet, origin = currentOrigin()): ShareTarget {
  const city = getCityForSet(set);
  return {
    kind: "set",
    set,
    url: `${origin}/sets/${set.id}`,
    title: `${set.artist} — ${set.title}`,
    text: `Listen to ${set.artist} at ${set.title}${city ? `, ${city}` : ""}.`,
  };
}

export function djShareTarget(
  dj: DJ,
  nextEvent: Event | null = null,
  origin = currentOrigin(),
): ShareTarget {
  return {
    kind: "dj",
    dj,
    nextEvent,
    url: `${origin}/djs/${dj.id}`,
    title: dj.name,
    text: `${dj.name} on Form:at.`,
  };
}

// "Form:at 004 · Sat 05.12 · Stereo". Plain spaces: this is message text,
// not a narrow label, and a non-breaking space can paste oddly elsewhere.
export function eventShareTarget(event: Event, origin = currentOrigin()): ShareTarget {
  const day = fmtEventDay(event.date).replace(/\u00A0/g, " ");
  return {
    kind: "event",
    url: `${origin}/events/${event.id}`,
    title: event.title,
    text: `${event.title} · ${day} · ${getVenueName(event)}`,
  };
}
