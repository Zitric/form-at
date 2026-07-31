import { composeStories } from "@storybook/react-vite";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as stories from "./Card.stories";

const {
  Default,
  Cta,
  WithImage,
  WithChildren,
  ActionWithoutOnClick,
  WithAction,
  Clickable,
  NestedActionKeyboardActivation,
} = composeStories(stories);

beforeEach(() => {
  vi.mocked(WithAction.args.onClick)?.mockClear();
  vi.mocked(Clickable.args.onClick)?.mockClear();
  vi.mocked(NestedActionKeyboardActivation.args.onClick)?.mockClear();
});

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

  it("renders dynamic children instead of the primary/secondary fallback", () => {
    render(<WithChildren />);
    expect(screen.getByTestId("custom-content")).toBeInTheDocument();
  });

  it("renders an action node with no interactive role when onClick is absent", () => {
    render(<ActionWithoutOnClick />);
    expect(screen.getByRole("button", { name: "[ info ]" })).toBeInTheDocument();
    // Only the nested action is a button — the card itself isn't activatable.
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("renders as a native <button> when onClick is provided and no action is nested", async () => {
    render(<Clickable />);
    const card = screen.getByRole("button");
    expect(card.tagName).toBe("BUTTON");
    expect(card).toHaveAttribute("type", "button");
    await userEvent.click(card);
    expect(Clickable.args.onClick).toHaveBeenCalledOnce();
  });

  it("falls back to div+role=button (tabindex 0) when onClick AND action coexist", async () => {
    render(<WithAction />);
    const buttons = screen.getAllByRole("button");
    const outerCard = buttons.find((b) => b.tagName !== "BUTTON");
    if (!outerCard) throw new Error("outer card wrapper not found");
    expect(outerCard).toHaveAttribute("tabindex", "0");
    await userEvent.click(outerCard);
    expect(WithAction.args.onClick).toHaveBeenCalledOnce();
  });

  it("does not fire the card's onClick when Enter is pressed on a nested action button", async () => {
    render(<NestedActionKeyboardActivation />);
    const nestedAction = screen.getByRole("button", { name: "[ play ]" });
    nestedAction.focus();
    await userEvent.keyboard("{Enter}");
    expect(NestedActionKeyboardActivation.args.onClick).not.toHaveBeenCalled();
  });

  it("still fires the card's onClick when Enter/Space is pressed on the wrapper itself (with an action present)", async () => {
    render(<NestedActionKeyboardActivation />);
    const buttons = screen.getAllByRole("button");
    const outerCard = buttons.find((b) => b.tagName !== "BUTTON");
    if (!outerCard) throw new Error("outer card wrapper not found");
    outerCard.focus();
    await userEvent.keyboard("{Enter}");
    expect(NestedActionKeyboardActivation.args.onClick).toHaveBeenCalledTimes(1);
    await userEvent.keyboard(" ");
    expect(NestedActionKeyboardActivation.args.onClick).toHaveBeenCalledTimes(2);
  });
});
