import type { DJ } from "@form-at/data/djs";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DjStoryButton } from "~/components/djStory/DjStoryButton";
import { useStore } from "~/store";

// The lazy sheet stands in for the real one: what the button hands it is
// what's under test.
const { sheetProps } = vi.hoisted(() => ({ sheetProps: vi.fn() }));
vi.mock("~/components/djStory/DjStorySheet", () => ({
  DjStorySheet: (props: { linkCopied: boolean }) => {
    sheetProps(props);
    return <div>sheet open, link copied: {String(props.linkCopied)}</div>;
  },
}));

const dj: DJ = { id: "dzeko", name: "Dzeko", type: "guest" };

function setClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    writable: true,
    value: { writeText },
  });
}

afterEach(() => {
  sheetProps.mockClear();
  useStore.setState({ toast: null });
});

describe("DjStoryButton", () => {
  it("copies the DJ page's link and opens the sheet", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    render(<DjStoryButton dj={dj} nextEvent={null} />);

    await userEvent.click(screen.getByRole("button", { name: /share_story/ }));

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/djs/dzeko`);
    expect(await screen.findByText("sheet open, link copied: true")).toBeInTheDocument();
  });

  it("opens the sheet anyway when the clipboard refuses, saying the link isn't copied", async () => {
    setClipboard(vi.fn().mockRejectedValue(new Error("denied")));
    render(<DjStoryButton dj={dj} nextEvent={null} />);

    await userEvent.click(screen.getByRole("button", { name: /share_story/ }));

    expect(await screen.findByText("sheet open, link copied: false")).toBeInTheDocument();
  });

  it("raises no toast: the sheet opens over it and carries the hint itself", async () => {
    setClipboard(vi.fn().mockResolvedValue(undefined));
    render(<DjStoryButton dj={dj} nextEvent={null} />);

    await userEvent.click(screen.getByRole("button", { name: /share_story/ }));
    await screen.findByText(/sheet open/);

    expect(useStore.getState().toast).toBeNull();
  });
});
