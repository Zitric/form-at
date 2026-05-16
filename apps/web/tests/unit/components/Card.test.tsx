import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Card } from "~/components/Card";

// The Card component renders an Image wrapper that uses our custom Image
// component (which builds picture/srcset). For unit tests we don't care about
// the image variants — we only assert structure and behaviour.

describe("Card", () => {
  it("renders primary/secondary text via fallback when no children passed", () => {
    render(<Card primary="Title" secondary="Subtitle" />);
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Subtitle")).toBeInTheDocument();
  });

  it("renders dynamic children when provided", () => {
    render(
      <Card>
        <div data-testid="custom">custom content</div>
      </Card>,
    );
    expect(screen.getByTestId("custom")).toBeInTheDocument();
  });

  it("renders an action node on the right", () => {
    render(<Card primary="t" action={<button type="button">[ info ]</button>} />);
    expect(screen.getByRole("button", { name: "[ info ]" })).toBeInTheDocument();
  });

  it("renders as a native <button> when onClick is provided and no action is nested", () => {
    render(<Card primary="t" onClick={() => {}} />);
    const card = screen.getByRole("button");
    // Native button — focusable without explicit tabindex.
    expect(card.tagName).toBe("BUTTON");
    expect(card).toHaveAttribute("type", "button");
  });

  it("falls back to div+role=button when onClick AND action coexist (no nested interactives)", () => {
    render(
      <Card primary="t" onClick={() => {}} action={<button type="button">[ play ]</button>} />,
    );
    // Outer card is the activatable role; the inner [ play ] button is also a button.
    const buttons = screen.getAllByRole("button");
    const outer = buttons.find((b) => b.tagName !== "BUTTON");
    expect(outer).toBeDefined();
    expect(outer).toHaveAttribute("tabindex", "0");
  });

  it("fires onClick on click and on Enter/Space keypress", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Card primary="t" onClick={onClick} />);

    const card = screen.getByRole("button");
    await user.click(card);
    expect(onClick).toHaveBeenCalledTimes(1);

    card.focus();
    await user.keyboard("{Enter}");
    expect(onClick).toHaveBeenCalledTimes(2);

    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it("has no role/tabindex when not interactive", () => {
    render(<Card primary="t" />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
