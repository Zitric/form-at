import type { DJ } from "@form-at/data/djs";
import type { Event } from "@form-at/data/events";
import type { MusicSet } from "@form-at/data/sets";
import { describe, expect, it } from "vitest";
import { djShareTarget, eventShareTarget, setShareTarget } from "~/utils/shareTarget";

const ORIGIN = "https://formatglasgow.com";

describe("share targets", () => {
  it("a set: its page, the listen text, and the set itself", () => {
    const set: MusicSet = {
      id: "test-set",
      title: "FORM:AT 001",
      artist: "Test Artist",
      date: "2026-01-01",
      src: "https://example.test/a.mp3",
    };
    expect(setShareTarget(set, ORIGIN)).toEqual({
      kind: "set",
      set,
      url: `${ORIGIN}/sets/test-set`,
      title: "Test Artist — FORM:AT 001",
      text: "Listen to Test Artist at FORM:AT 001.",
    });
  });

  it("a DJ: their page and '<name> on Form:at.', carrying the DJ for the Story image", () => {
    const dj: DJ = { id: "dzeko", name: "Dzeko", type: "guest" };
    expect(djShareTarget(dj, null, ORIGIN)).toEqual({
      kind: "dj",
      dj,
      nextEvent: null,
      url: `${ORIGIN}/djs/dzeko`,
      title: "Dzeko",
      text: "Dzeko on Form:at.",
    });
  });

  it("a DJ with a night announced carries it, for the Story image's event line", () => {
    const dj: DJ = { id: "dzeko", name: "Dzeko", type: "guest" };
    const next = {
      id: "format-004",
      title: "Form:at 004",
      date: "2026-12-05",
      venue: "Stereo, Glasgow",
      city: "Glasgow",
      lineupIds: ["dzeko"],
      audio: "techno",
      runtime: "23:00 — tbc",
      status: "upcoming" as const,
    };
    const target = djShareTarget(dj, next, ORIGIN);
    expect(target.kind === "dj" && target.nextEvent).toBe(next);
    // The shared text stays the DJ's own: the event is for the image only.
    expect(target.text).toBe("Dzeko on Form:at.");
  });

  it("an event: its page and '<title> · <day> · <venue name>', with plain spaces", () => {
    const event: Event = {
      id: "format-004",
      title: "Form:at 004",
      date: "2026-12-05",
      venue: "Stereo, Renfield Lane, City Centre, Glasgow",
      city: "Glasgow",
      lineupIds: [],
      audio: "techno",
      runtime: "23:00 — tbc",
      status: "upcoming",
    };
    const target = eventShareTarget(event, ORIGIN);
    expect(target).toEqual({
      kind: "event",
      url: `${ORIGIN}/events/format-004`,
      title: "Form:at 004",
      text: "Form:at 004 · Sat 05.12 · Stereo",
    });
    expect(target.text).not.toMatch(/\u00A0/);
  });
});
