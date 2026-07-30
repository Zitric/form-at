import { composeStories } from "@storybook/react-vite";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as stories from "./ToastShell.stories";

const { Default, ErrorVariant, StyleOverride } = composeStories(stories);

describe("ToastShell", () => {
  it("default variant renders gold-toned classes and defaults zIndexClassName to z-50", () => {
    render(<Default />);
    const button = screen.getByRole("button", { name: "Dismiss notification" });
    expect(button.className).toContain("text-gold");
    const wrapper = button.parentElement;
    expect(wrapper?.className).toContain("z-50");
  });

  it("error variant applies role=alert and red-toned classes", () => {
    render(<ErrorVariant />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Dismiss playback error" });
    expect(button.className).toContain("text-red-400");
  });

  it("accepts a custom zIndexClassName", () => {
    render(<Default zIndexClassName="z-30" />);
    const wrapper = screen.getByRole("button").parentElement;
    expect(wrapper?.className).toContain("z-30");
    expect(wrapper?.className).not.toContain("z-50");
  });

  it("shares the same padding/layout/entrance classes across variants", () => {
    const { unmount } = render(<Default />);
    const defaultClass = screen.getByRole("button").className;
    unmount();

    render(<ErrorVariant />);
    const errorClass = screen.getByRole("button").className;

    for (const shared of ["px-5", "py-3.5", "gap-4", "max-w-sm", "animate-fade-in-up"]) {
      expect(defaultClass).toContain(shared);
      expect(errorClass).toContain(shared);
    }
  });

  it("lets an inline style override win over the default entrance class via CSS specificity", () => {
    render(<StyleOverride />);
    const button = screen.getByRole("button", { name: "Dismiss notification" });
    // The class is still present (no conditional dropping)...
    expect(button.className).toContain("animate-fade-in-up");
    // ...but the inline style is what actually governs the animation.
    expect(button.style.animation).toContain("fadeOutDown");
  });
});
