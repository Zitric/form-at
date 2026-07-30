import { Modal } from "@form-at/ui";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

describe("Modal", () => {
  it("renders nothing when open is false", () => {
    const { container } = render(
      <Modal open={false} onClose={() => {}}>
        content
      </Modal>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders title and children when open", () => {
    render(
      <Modal open onClose={() => {}} title={<span>my title</span>}>
        <div>my content</div>
      </Modal>,
    );
    expect(screen.getByText("my title")).toBeInTheDocument();
    expect(screen.getByText("my content")).toBeInTheDocument();
  });

  it("calls onClose on backdrop click", () => {
    const onClose = vi.fn();
    const { container } = render(
      <Modal open onClose={onClose}>
        content
      </Modal>,
    );
    // First child is the backdrop wrapper that owns the onClick.
    fireEvent.click(container.firstChild as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does NOT call onClose when panel content is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal open onClose={onClose}>
        <div data-testid="content">content</div>
      </Modal>,
    );
    await user.click(screen.getByTestId("content"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose on Escape key", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal open onClose={onClose}>
        content
      </Modal>,
    );
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the close button is clicked", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <Modal open onClose={onClose}>
        content
      </Modal>,
    );
    await user.click(screen.getByRole("button", { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("exposes the panel as a dialog with aria-modal and aria-label", () => {
    render(
      <Modal open onClose={() => {}} ariaLabel="Test dialog">
        content
      </Modal>,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveAttribute("aria-label", "Test dialog");
  });
});
