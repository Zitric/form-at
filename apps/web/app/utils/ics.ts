import type { Event } from "~/data/events";
import { buildAndroidIntent, isAndroid } from "~/utils/deeplink";
import { eventDateTimes } from "~/utils/jsonld";

// ICS spec disallows raw `,` `;` `\` and newlines in text fields — they must be
// backslash-escaped. Keep this in lock-step with RFC 5545 §3.3.11 if we ever
// surface user-generated content here (currently all values come from sets data).
const escapeIcs = (s: string): string =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

// "2026-08-28T23:00:00" → "20260828T230000"
const isoToIcsLocal = (iso: string): string => iso.replace(/[-:]/g, "").slice(0, 15);

const dtStamp = (): string => `${new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15)}Z`;

// What's the UTC offset (in minutes) of Europe/London at the given UTC instant?
// Used to convert "London local" wall-clock times into absolute UTC, which is
// what Google Calendar and Outlook deep-link URLs expect.
function londonOffsetMinutes(at: Date): number {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(at).map((p) => [p.type, p.value]));
  const londonAsUtcMs = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
  );
  return (londonAsUtcMs - at.getTime()) / 60000;
}

// Treat a local ISO string ("2026-08-28T23:00:00") as Europe/London wall-clock
// time and return the corresponding UTC `Date`. Handles BST/GMT transitions.
function londonLocalToUtc(localIso: string): Date {
  const naive = new Date(`${localIso}Z`);
  const offsetMin = londonOffsetMinutes(naive);
  return new Date(naive.getTime() - offsetMin * 60000);
}

const utcToIcsZ = (d: Date): string => `${d.toISOString().replace(/[-:.]/g, "").slice(0, 15)}Z`;

/** Builds an RFC 5545 .ics payload for a Form:at event. Uses TZID=Europe/London
 *  so calendars convert the time to the viewer's local zone correctly — without
 *  a VTIMEZONE block, but the named IANA zone is universally recognised by
 *  Apple Calendar, Google Calendar, and Outlook. */
export function buildIcs(event: Event): string {
  const { startDate, endDate } = eventDateTimes(event.date, event.runtime);
  const dtStart = isoToIcsLocal(startDate);
  const dtEnd = endDate ? isoToIcsLocal(endDate) : dtStart;
  const TZ = "Europe/London";

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Form:at//Glasgow//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${event.id}@formatglasgow.com`,
    `DTSTAMP:${dtStamp()}`,
    `DTSTART;TZID=${TZ}:${dtStart}`,
    `DTEND;TZID=${TZ}:${dtEnd}`,
    `SUMMARY:${escapeIcs(event.title)}`,
    `LOCATION:${escapeIcs(event.venue)}`,
    `DESCRIPTION:${escapeIcs(event.audio)}`,
    `URL:https://formatglasgow.com/events/${event.id}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/** Google Calendar deep-link — opens https://calendar.google.com with the new
 *  event pre-filled. Dates must be absolute UTC in the `dates=START/END` format. */
export function buildGoogleCalendarUrl(event: Event): string {
  const { startDate, endDate } = eventDateTimes(event.date, event.runtime);
  const startUtc = londonLocalToUtc(startDate);
  const endUtc = endDate ? londonLocalToUtc(endDate) : startUtc;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${utcToIcsZ(startUtc)}/${utcToIcsZ(endUtc)}`,
    location: event.venue,
    details: event.audio,
  });
  return `https://www.google.com/calendar/render?${params}`;
}

/** Android-only `intent://` URL that opens the native Google Calendar app
 *  directly. Falls back to the web URL if the app isn't installed. On any
 *  non-Android user agent this returns the web URL unchanged. */
export function buildGoogleCalendarTargetUrl(event: Event): string {
  const webUrl = buildGoogleCalendarUrl(event);
  return isAndroid() ? buildAndroidIntent(webUrl, "com.google.android.calendar") : webUrl;
}

/** Outlook Live deep-link — opens outlook.live.com calendar compose view with
 *  the event pre-filled. Dates are ISO 8601 with `Z` (absolute UTC). */
export function buildOutlookCalendarUrl(event: Event): string {
  const { startDate, endDate } = eventDateTimes(event.date, event.runtime);
  const startUtc = londonLocalToUtc(startDate);
  const endUtc = endDate ? londonLocalToUtc(endDate) : startUtc;
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: event.title,
    body: event.audio,
    startdt: startUtc.toISOString(),
    enddt: endUtc.toISOString(),
    location: event.venue,
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params}`;
}

/** Android-only `intent://` URL that tries to open the native Outlook app.
 *  Falls back to the web URL if the app isn't installed *or* if Outlook
 *  hasn't been granted "open supported links" for outlook.live.com (a per-app
 *  Android setting that defaults to off). On non-Android user agents this
 *  returns the web URL unchanged. */
export function buildOutlookCalendarTargetUrl(event: Event): string {
  const webUrl = buildOutlookCalendarUrl(event);
  return isAndroid() ? buildAndroidIntent(webUrl, "com.microsoft.office.outlook") : webUrl;
}
