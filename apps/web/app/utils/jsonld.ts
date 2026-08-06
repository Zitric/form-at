import type { MusicSet } from "@form-at/data/sets";
/**
 * Schema.org JSON-LD builders. Each one produces the structured-data payload
 * that goes inside <script type="application/ld+json"> on its route.
 *
 * Search engines (Google rich results) and AI crawlers (ChatGPT, Claude,
 * Perplexity) parse this to understand what entity each page represents —
 * a music group, a person, a recording, a scheduled event.
 *
 * Reference: https://schema.org/docs/full.html
 */
import type { DJ } from "~/data/djs";
import { djs } from "~/data/djs";
import type { Event } from "~/data/events";
import { SOCIALS, SOCIAL_ORDER } from "./socials";

const SITE = "https://formatglasgow.com";

// Form:at's own external presence — strengthens entity recognition for AI
// search ("which Glasgow techno collective is Form:at?") and Google's
// knowledge graph. Add new platforms here as the collective claims them.
const FORMAT_SAME_AS = ["https://www.instagram.com/form.at_glasgow/"];

// ── helpers ────────────────────────────────────────────────────────────────

/** "1:39:30" → "PT1H39M30S" · "45:18" → "PT45M18S" · undefined → undefined */
function durationToISO8601(s: string | undefined): string | undefined {
  if (!s) return undefined;
  const parts = s.split(":").map(Number);
  let h = 0;
  let m = 0;
  let sec = 0;
  if (parts.length === 3) [h, m, sec] = parts as [number, number, number];
  else if (parts.length === 2) [m, sec] = parts as [number, number];
  else return undefined;
  const result = `PT${h ? `${h}H` : ""}${m ? `${m}M` : ""}${sec ? `${sec}S` : ""}`;
  return result === "PT" ? "PT0S" : result;
}

/**
 * Combine `event.date` ("2026-04-24") with `event.runtime` ("23:00 — 05:00")
 * into ISO 8601 local datetimes for Schema.org. End time wrapping past
 * midnight rolls the date forward by a day.
 *
 * `startDate` must ALWAYS be a full `T`-qualified local datetime, never a bare
 * date. This matters beyond Schema.org: `ics.ts`'s calendar-link builders feed
 * it straight into `new Date(\`${startDate}Z\`)`, and a bare date there
 * (`"2026-07-24Z"`, no time component) is malformed ISO 8601 — Chromium parses
 * it leniently, but WebKit/Safari throws "date value is not finite" inside
 * `Intl.DateTimeFormat().formatToParts()` and crashes the whole event page.
 * A runtime like "20:30 — very late", with an unparseable end time, is what
 * reaches case 2 below. Three cases, most to least specific:
 *   1. Both start and end are `HH:MM` — full range, as before.
 *   2. Only the start is `HH:MM` (e.g. "20:30 — very late") — keep the REAL
 *      start time; omit `endDate` rather than invent one (every consumer
 *      already treats a missing `endDate` as "same as start" gracefully:
 *      `eventLd`'s spread, `buildIcs`'s `endDate ? ... : dtStart`).
 *   3. Nothing parses at all — midnight, so the shape stays valid everywhere
 *      that consumes it, even though the specific time is a guess.
 *
 * Local-time strings (no timezone) are intentional: Glasgow flips between
 * GMT and BST across the year, and Schema.org interprets unqualified
 * datetimes in the event location's local timezone — which is what we want.
 */
export function eventDateTimes(
  date: string,
  runtime: string | undefined,
): {
  startDate: string;
  endDate?: string;
} {
  const rangeMatch = runtime?.match(/(\d{1,2}):(\d{2})\s*[—–-]\s*(\d{1,2}):(\d{2})/);
  if (rangeMatch) {
    const [, sh, sm, eh, em] = rangeMatch as unknown as [string, string, string, string, string];
    const startDate = `${date}T${sh.padStart(2, "0")}:${sm}:00`;
    const startMin = Number(sh) * 60 + Number(sm);
    const endMin = Number(eh) * 60 + Number(em);

    const endDateBase =
      endMin < startMin ? new Date(`${date}T00:00:00Z`).getTime() + 86400000 : null;
    const endDay = endDateBase ? new Date(endDateBase).toISOString().slice(0, 10) : date;
    const endDate = `${endDay}T${eh.padStart(2, "0")}:${em}:00`;

    return { startDate, endDate };
  }

  const startOnlyMatch = runtime?.match(/(\d{1,2}):(\d{2})/);
  if (startOnlyMatch) {
    const [, sh, sm] = startOnlyMatch as unknown as [string, string, string];
    return { startDate: `${date}T${sh.padStart(2, "0")}:${sm}:00` };
  }

  return { startDate: `${date}T00:00:00` };
}

/** Collect full social URLs for the `sameAs` field. */
function djSameAs(dj: DJ): string[] {
  if (!dj.socials) return [];
  const out: string[] = [];
  for (const key of SOCIAL_ORDER) {
    const handle = dj.socials[key];
    if (handle) out.push(SOCIALS[key].toUrl(handle));
  }
  return out;
}

/** Find the DJ whose `setIds` includes this set, for the `byArtist` link. */
function djFromSet(setId: string): DJ | undefined {
  return djs.find((d) => d.setIds?.includes(setId));
}

/** Build the absolute image URL from a path like "djs/julz-lever". */
function imageUrl(path: string | undefined): string | undefined {
  return path ? `${SITE}/images/${path}-1080.webp` : undefined;
}

// ── public builders ────────────────────────────────────────────────────────

export function organizationLd() {
  return {
    "@context": "https://schema.org",
    "@type": "MusicGroup",
    name: "Form:at",
    alternateName: "FORM:AT",
    url: SITE,
    logo: `${SITE}/icon-512.png`,
    image: `${SITE}/og-image.png`,
    description: "Glasgow techno collective. Analog soul in a digital world.",
    genre: ["Techno", "Electro", "Dub"],
    foundingLocation: {
      "@type": "Place",
      name: "Glasgow, Scotland",
    },
    sameAs: FORMAT_SAME_AS,
  };
}

export function djLd(dj: DJ) {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: dj.name,
    url: `${SITE}/djs/${dj.id}`,
    image: imageUrl(dj.photo) ?? `${SITE}/og/djs/${dj.id}.png`,
    description: dj.bio,
    memberOf: {
      "@type": "MusicGroup",
      name: "Form:at",
      url: SITE,
    },
    sameAs: djSameAs(dj),
  };
}

export function setLd(set: MusicSet) {
  const dj = djFromSet(set.id);
  return {
    "@context": "https://schema.org",
    "@type": "MusicRecording",
    name: `${set.artist} — ${set.title}`,
    url: `${SITE}/sets/${set.id}`,
    byArtist: {
      "@type": "Person",
      name: set.artist,
      ...(dj ? { url: `${SITE}/djs/${dj.id}` } : {}),
    },
    datePublished: set.date,
    duration: durationToISO8601(set.duration),
    description: set.description,
    image: imageUrl(set.artwork),
    audio: set.src,
    inAlbum: {
      "@type": "MusicAlbum",
      name: set.title,
      byArtist: { "@type": "MusicGroup", name: "Form:at", url: SITE },
    },
  };
}

export function eventLd(event: Event, lineup: ReadonlyArray<DJ | undefined>) {
  const resolvedLineup = lineup.filter((dj): dj is DJ => Boolean(dj));
  const { startDate, endDate } = eventDateTimes(event.date, event.runtime);
  return {
    "@context": "https://schema.org",
    "@type": "MusicEvent",
    name: event.title,
    url: `${SITE}/events/${event.id}`,
    description: event.description,
    startDate,
    ...(endDate ? { endDate } : {}),
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: event.venue,
      address: {
        "@type": "PostalAddress",
        addressLocality: "Glasgow",
        addressCountry: "GB",
      },
    },
    performer: resolvedLineup.map((dj) => ({
      "@type": "Person",
      name: dj.name,
      url: `${SITE}/djs/${dj.id}`,
    })),
    organizer: { "@type": "MusicGroup", name: "Form:at", url: SITE },
    image: imageUrl(event.flyer),
  };
}
