import { describe, expect, it } from "vitest";
import { slugifySetId } from "~/utils/slugifySetId";

// Real convention confirmed against the 4
// legacy rows (schema.sql / sets.generated.ts): `set-{eventSequence}-
// {artistSlug}`, where the sequence is the EVENT number extracted from a
// "Form:at NNN" title, not a slug of the title itself.

describe("slugifySetId", () => {
  it("matches the real convention for a 'Form:at NNN' title", () => {
    expect(slugifySetId("Form:at 002", "t.i.l.")).toBe("set-002-t-i-l");
    expect(slugifySetId("Form:at 002", "Brandon Lee Vear")).toBe("set-002-brandon-lee-vear");
  });

  it("zero-pads a single/double-digit event number to 3 digits", () => {
    expect(slugifySetId("Form:at 3", "New Artist")).toBe("set-003-new-artist");
    expect(slugifySetId("Form:at 42", "New Artist")).toBe("set-042-new-artist");
  });

  it("doesn't re-pad an already 3+-digit number", () => {
    expect(slugifySetId("Form:at 123", "New Artist")).toBe("set-123-new-artist");
  });

  it("is case-insensitive on the 'Form:at' prefix and tolerant of extra whitespace", () => {
    expect(slugifySetId("form:at   002", "New Artist")).toBe("set-002-new-artist");
    expect(slugifySetId("FORM:AT 002", "New Artist")).toBe("set-002-new-artist");
  });

  it("falls back to a title+artist slug when the title doesn't match the event convention", () => {
    expect(slugifySetId("Boiler Room Glasgow", "New Artist")).toBe(
      "set-boiler-room-glasgow-new-artist",
    );
  });

  it("kebab-slugifies non-alphanumeric characters in both title and artist", () => {
    expect(slugifySetId("A Special Night!", "DJ Foo & Bar")).toBe("set-a-special-night-dj-foo-bar");
  });
});
