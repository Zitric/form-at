import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NextIcon, PauseIcon, PlayIcon, PrevIcon } from "~/components/PlayerIcons";

describe("PlayerIcons", () => {
  it("renders SVG (not unicode emoji) for Play", () => {
    const { container } = render(<PlayIcon />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("aria-hidden")).toBe("true");
    // No unicode characters that would be rendered as emoji on Android/iOS
    expect(container.textContent).not.toMatch(/[▶⏸⏮⏭]/);
  });

  it("renders SVG for Pause", () => {
    const { container } = render(<PauseIcon />);
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("renders SVG for Prev/Next", () => {
    const { container: prev } = render(<PrevIcon />);
    const { container: next } = render(<NextIcon />);
    expect(prev.querySelector("svg")).not.toBeNull();
    expect(next.querySelector("svg")).not.toBeNull();
  });

  it("inherits color via currentColor", () => {
    const { container } = render(<PlayIcon />);
    const path = container.querySelector("path");
    expect(container.querySelector("svg")?.getAttribute("fill")).toBe("currentColor");
    expect(path).not.toBeNull();
  });

  it("inherits size via 1em", () => {
    const { container } = render(<PlayIcon />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("1em");
    expect(svg?.getAttribute("height")).toBe("1em");
  });
});
