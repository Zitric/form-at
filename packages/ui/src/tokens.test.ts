import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { colors } from "./tokens";

function parseThemeColors(css: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of css.matchAll(/--color-(\w+):\s*(#[0-9a-fA-F]{3,8})/g)) {
    const [, name, hex] = m;
    if (name && hex) out[name] = hex.toLowerCase();
  }
  return out;
}

describe("design tokens stay in sync", () => {
  it("tokens.css @theme colors match tokens.ts colors exactly", () => {
    const css = readFileSync(join(import.meta.dirname, "tokens.css"), "utf-8");
    const cssColors = parseThemeColors(css);
    const jsColors = Object.fromEntries(
      Object.entries(colors).map(([k, v]) => [k, v.toLowerCase()]),
    );
    expect(cssColors).toEqual(jsColors);
  });
});
