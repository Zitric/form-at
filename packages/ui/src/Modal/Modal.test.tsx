import { composeStories } from "@storybook/react-vite";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import * as stories from "./Modal.stories";

const { Open } = composeStories(stories);

beforeEach(() => {
  Open.args.onClose?.mockClear();
});

describe("Modal", () => {
  it("renders nothing when closed", () => {
    render(<Open open={false} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders the title and children when open", () => {
    render(<Open />);
    expect(screen.getByText("save for offline?")).toBeInTheDocument();
    expect(screen.getByText(/downloaded to your device/)).toBeInTheDocument();
  });

  it("closes on Escape", async () => {
    render(<Open />);
    const dialog = screen.getByRole("dialog");
    dialog.focus();
    await userEvent.keyboard("{Escape}");
    expect(Open.args.onClose).toHaveBeenCalledOnce();
  });

  it("closes on backdrop click but not on content click", async () => {
    render(<Open />);
    const dialog = screen.getByRole("dialog");
    await userEvent.click(screen.getByText(/downloaded to your device/));
    expect(Open.args.onClose).not.toHaveBeenCalled();
    await userEvent.click(dialog);
    expect(Open.args.onClose).toHaveBeenCalledOnce();
  });
});
