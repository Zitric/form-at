import type { DJ } from "@form-at/data/djs";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DjStorySheet } from "~/components/djStory/DjStorySheet";

// The canvas work is the renderer's (renderDjStory.test.ts covers its pure
// parts; jsdom draws nothing): here the image is a stand-in blob, and the
// sheet's own behaviour is under test.
const { trackEvent, drawDjStory } = vi.hoisted(() => ({
  trackEvent: vi.fn(),
  drawDjStory: vi.fn(),
}));
vi.mock("~/hooks/useTrackEvent", () => ({ useTrackEvent: () => trackEvent }));
vi.mock("~/utils/djStory/renderDjStory", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/djStory/renderDjStory")>();
  return {
    ...actual,
    loadDjStoryAssets: async () => ({ photo: null, wordmark: null, fontsLoaded: true }),
    drawDjStory,
    canvasToJpeg: async () => new Blob(["jpeg"], { type: "image/jpeg" }),
  };
});

const dj: DJ = { id: "dzeko", name: "Dzeko", type: "guest", photo: "djs/dzeko" };

function setShareSupport(share: ((data: ShareData) => Promise<void>) | null) {
  for (const key of ["share", "canShare"] as const) {
    Object.defineProperty(navigator, key, {
      configurable: true,
      writable: true,
      value: share ? (key === "share" ? share : () => true) : undefined,
    });
  }
}

async function renderSheet(props: Partial<{ linkCopied: boolean; onClose: () => void }> = {}) {
  const onClose = props.onClose ?? vi.fn();
  render(
    <DjStorySheet
      dj={dj}
      nextEvent={null}
      linkCopied={props.linkCopied ?? true}
      onClose={onClose}
    />,
  );
  // Ready once the image is rendered: the action button stops being disabled.
  await waitFor(() => expect(screen.getByRole("button", { name: /share|download/ })).toBeEnabled());
  return { onClose };
}

beforeEach(() => {
  trackEvent.mockClear();
  drawDjStory.mockClear();
});

afterEach(() => {
  setShareSupport(null);
  vi.restoreAllMocks();
});

describe("DjStorySheet", () => {
  it("records the sheet opening", async () => {
    await renderSheet();
    expect(trackEvent).toHaveBeenCalledWith("dj_story_open");
  });

  it("offers exactly form:at and raw", async () => {
    await renderSheet();
    const chips = screen
      .getAllByRole("button")
      .filter((b) => b.hasAttribute("aria-pressed"))
      .map((b) => b.textContent?.replace(/[[\]\s]/g, ""));
    expect(chips).toEqual(["form:at", "raw"]);
  });

  it("makes each chip a 44px tap target at text-sm, its brackets in one nowrap span", async () => {
    await renderSheet();
    const chips = screen.getAllByRole("button").filter((b) => b.hasAttribute("aria-pressed"));
    for (const chip of chips) {
      expect(chip).toHaveClass("min-h-11");
      expect(chip.parentElement).toHaveClass("text-sm");
      expect(chip.parentElement).not.toHaveClass("text-xs");
    }
    const selected = screen.getByRole("button", { name: /form:at/, pressed: true });
    expect(selected.querySelector(".whitespace-nowrap")).toHaveTextContent(/^\[\s*form:at\s*\]$/);
  });

  it("starts on form:at and redraws when another treatment is picked", async () => {
    await renderSheet();
    expect(screen.getByRole("button", { name: /form:at/, pressed: true })).toBeInTheDocument();
    expect(drawDjStory).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ treatment: "format", name: "Dzeko", line: "guest" }),
    );

    await userEvent.click(screen.getByRole("button", { name: "raw" }));
    await waitFor(() =>
      expect(drawDjStory).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ treatment: "raw" }),
      ),
    );
    expect(screen.getByRole("button", { name: /raw/, pressed: true })).toBeInTheDocument();
  });

  it("shares the JPEG as a file where the browser can share files", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    setShareSupport(share);
    const { onClose } = await renderSheet();

    await userEvent.click(screen.getByRole("button", { name: /share/ }));

    const [data] = share.mock.calls[0] as [ShareData];
    const [file] = data.files ?? [];
    expect(file?.name).toBe("formatglasgow-dzeko.jpg");
    expect(file?.type).toBe("image/jpeg");
    expect(trackEvent).toHaveBeenCalledWith("dj_story_shared");
    expect(onClose).toHaveBeenCalled();
  });

  it("stays open, untracked, when the share sheet is cancelled", async () => {
    setShareSupport(vi.fn().mockRejectedValue(new DOMException("cancelled", "AbortError")));
    const { onClose } = await renderSheet();

    await userEvent.click(screen.getByRole("button", { name: /share/ }));

    expect(onClose).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalledWith("dj_story_shared");
    expect(trackEvent).not.toHaveBeenCalledWith("dj_story_downloaded");
  });

  it("downloads the JPEG where files can't be shared", async () => {
    setShareSupport(null);
    URL.createObjectURL = vi.fn(() => "blob:story");
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { onClose } = await renderSheet();

    await userEvent.click(screen.getByRole("button", { name: /download/ }));

    const anchor = click.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.download).toBe("formatglasgow-dzeko.jpg");
    expect(anchor.href).toBe("blob:story");
    expect(trackEvent).toHaveBeenCalledWith("dj_story_downloaded");
    expect(onClose).toHaveBeenCalled();
  });

  it("says the link is copied", async () => {
    await renderSheet({ linkCopied: true });
    expect(
      screen.getByText(/link copied: add it in Instagram as a link sticker/),
    ).toBeInTheDocument();
  });

  it("names the link to add when the clipboard failed", async () => {
    await renderSheet({ linkCopied: false });
    expect(
      screen.getByText("add formatglasgow.com/djs/dzeko in Instagram as a link sticker"),
    ).toBeInTheDocument();
  });
});
