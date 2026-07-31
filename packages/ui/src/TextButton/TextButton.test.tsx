import { composeStories } from "@storybook/react-vite";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import * as stories from "./TextButton.stories";

const { Default } = composeStories(stories);

beforeEach(() => {
  Default.args.onClick?.mockClear();
});

describe("TextButton", () => {
  it("renders as an underlined secondary-emphasis button, not a bracket CTA", () => {
    render(<Default />);
    const button = screen.getByRole("button", { name: "not now" });
    expect(button).toHaveClass("underline");
    expect(screen.queryByText("[")).not.toBeInTheDocument();
  });

  it("fires onClick when clicked", async () => {
    render(<Default />);
    await userEvent.setup().click(screen.getByRole("button"));
    expect(Default.args.onClick).toHaveBeenCalledTimes(1);
  });
});
