import { composeStories } from "@storybook/react-vite";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import * as stories from "./TerminalRow.stories";

const { Default, Dimmed } = composeStories(stories);

describe("TerminalRow", () => {
  it("renders the gold › prefix, label, and value", () => {
    const { container } = render(<Default />);
    expect(screen.getByText("›")).toHaveClass("text-gold");
    expect(container).toHaveTextContent("total_plays: 1,204");
  });

  it("renders the value plainly (no opacity wrapper) when dimValue is unset", () => {
    const { container } = render(<Default />);
    expect(container).toHaveTextContent("1,204");
    expect(container.querySelector(".opacity-50")).not.toBeInTheDocument();
  });

  it("wraps the value in an opacity-50 span when dimValue is set", () => {
    const { container } = render(<Dimmed />);
    expect(container).toHaveTextContent("excluded_plays: 12");
    expect(screen.getByText("12")).toHaveClass("opacity-50");
  });
});
