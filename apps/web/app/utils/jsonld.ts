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
import type { MusicSet } from "~/data/sets";
import { SOCIALS, SOCIAL_ORDER } from "./socials";

const SITE = "https://formatglasgow.com";

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
    sameAs: ["https://www.instagram.com/form.at_glasgow/"],
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
  return {
    "@context": "https://schema.org",
    "@type": "MusicEvent",
    name: event.title,
    url: `${SITE}/events/${event.id}`,
    startDate: event.date,
    eventStatus:
      event.status === "upcoming"
        ? "https://schema.org/EventScheduled"
        : "https://schema.org/EventScheduled",
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
