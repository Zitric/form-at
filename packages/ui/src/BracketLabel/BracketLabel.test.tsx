import { composeStories } from "@storybook/react-vite";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as stories from "./BracketLabel.stories";

const { Gold, Red, NeverWrapsMidBracket } = composeStories(stories);

describe("BracketLabel", () => {
  it("renders gold brackets around the label", () => {
    render(<Gold />);
    expect(screen.getByText("update")).toBeInTheDocument();
    expect(screen.getByText("[")).toHaveClass("text-gold");
    expect(screen.getByText("]")).toHaveClass("text-gold");
  });

  it("renders red brackets for the destructive tone", () => {
    render(<Red />);
    expect(screen.getByText("[")).toHaveClass("text-red-400");
  });

  it("wraps the whole triplet in a single whitespace-nowrap span", () => {
    render(<NeverWrapsMidBracket />);
    const bracket = screen.getByText("[").parentElement;
    expect(bracket).toHaveClass("whitespace-nowrap");
    expect(bracket).toHaveTextContent("[ save_for_offline ]");
  });
});
