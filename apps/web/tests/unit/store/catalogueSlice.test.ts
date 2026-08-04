import type { MusicSet } from "@form-at/data/sets";
import { describe, expect, it } from "vitest";
import { getAdjacentSets, getCatalogueSet } from "~/store/catalogueSlice";

const set = (id: string): MusicSet => ({
  id,
  title: id,
  artist: id,
  date: "2026-01-01",
  src: `https://cdn.formatglasgow.com/sets/${id}/audio.mp3`,
});

const catalogue = [set("a"), set("b"), set("c")];

describe("getCatalogueSet", () => {
  it("finds a set by id", () => {
    expect(getCatalogueSet(catalogue, "b")).toEqual(set("b"));
  });

  it("returns undefined for an unknown id", () => {
    expect(getCatalogueSet(catalogue, "not-there")).toBeUndefined();
  });
});

describe("getAdjacentSets", () => {
  it("returns both neighbours for a middle set", () => {
    expect(getAdjacentSets(catalogue, "b")).toEqual({ prev: set("a"), next: set("c") });
  });

  it("returns null prev for the first set", () => {
    expect(getAdjacentSets(catalogue, "a")).toEqual({ prev: null, next: set("b") });
  });

  it("returns null next for the last set", () => {
    expect(getAdjacentSets(catalogue, "c")).toEqual({ prev: set("b"), next: null });
  });

  it("returns both null when currentId is undefined", () => {
    expect(getAdjacentSets(catalogue, undefined)).toEqual({ prev: null, next: null });
  });

  it("returns both null when currentId isn't in the catalogue", () => {
    expect(getAdjacentSets(catalogue, "not-there")).toEqual({ prev: null, next: null });
  });
});
