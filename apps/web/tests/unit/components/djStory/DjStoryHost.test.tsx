import type { DJ } from "@form-at/data/djs";
import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DjStoryHost } from "~/components/djStory/DjStoryHost";
import { useStore } from "~/store";

// The lazy sheet stands in for the real one: what the host hands it, from
// the store, is what's under test.
const { sheetProps } = vi.hoisted(() => ({ sheetProps: vi.fn() }));
vi.mock("~/components/djStory/DjStorySheet", () => ({
  DjStorySheet: (props: { dj: DJ; linkCopied: boolean; onClose: () => void }) => {
    sheetProps(props);
    return (
      <div>
        sheet for {props.dj.name}, link copied: {String(props.linkCopied)}
        <button type="button" onClick={props.onClose}>
          close
        </button>
      </div>
    );
  },
}));

const dj: DJ = { id: "dzeko", name: "Dzeko", type: "guest" };

afterEach(() => {
  sheetProps.mockClear();
  useStore.setState({ djStory: null, toast: null });
});

describe("DjStoryHost", () => {
  it("renders nothing until a DJ Story is opened", () => {
    useStore.setState({ djStory: null });
    const { container } = render(<DjStoryHost />);
    expect(container).toBeEmptyDOMElement();
    expect(sheetProps).not.toHaveBeenCalled();
  });

  it("opens the sheet with the DJ, their next night and whether the link was copied", async () => {
    useStore.setState({ djStory: { dj, nextEvent: null, linkCopied: true } });
    render(<DjStoryHost />);

    expect(await screen.findByText("sheet for Dzeko, link copied: true")).toBeInTheDocument();
    expect(sheetProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ dj, nextEvent: null, linkCopied: true }),
    );
  });

  it("closes through the store", async () => {
    useStore.setState({ djStory: { dj, nextEvent: null, linkCopied: false } });
    render(<DjStoryHost />);

    const close = await screen.findByRole("button", { name: "close" });
    act(() => close.click());

    expect(useStore.getState().djStory).toBeNull();
    expect(screen.queryByText(/sheet for/)).not.toBeInTheDocument();
  });

  it("raises no toast: the sheet carries the link hint itself", async () => {
    useStore.setState({ djStory: { dj, nextEvent: null, linkCopied: true } });
    render(<DjStoryHost />);
    await screen.findByText(/sheet for/);

    expect(useStore.getState().toast).toBeNull();
  });
});
