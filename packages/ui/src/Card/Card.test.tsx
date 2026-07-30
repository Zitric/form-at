import { composeStories } from "@storybook/react-vite";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import * as stories from "./Card.stories";

const { Default, Cta, WithImage, NestedActionKeyboardActivation } = composeStories(stories);

describe("Card", () => {
  it("renders primary/secondary fallback text", () => {
    render(<Default />);
    expect(screen.getByText("Form:at 002")).toBeInTheDocument();
    expect(screen.getByText("Julz Lever")).toBeInTheDocument();
  });

  it("cta variant has no interactive role when onClick is absent", () => {
    render(<Cta />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("renders the image slot content when provided", () => {
    const { container } = render(<WithImage />);
    expect(container.querySelector('[style*="background"]')).toBeInTheDocument();
  });

  it("does not fire the card's onClick when Enter is pressed on a nested action button", async () => {
    render(<NestedActionKeyboardActivation />);
    const nestedAction = screen.getByRole("button", { name: "[ play ]" });
    nestedAction.focus();
    await userEvent.keyboard("{Enter}");
    expect(NestedActionKeyboardActivation.args.onClick).not.toHaveBeenCalled();
  });
});
