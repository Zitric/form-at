import { composeStories } from "@storybook/react-vite";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as stories from "./ToastShell.stories";

const { Default, ErrorVariant } = composeStories(stories);

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
});
