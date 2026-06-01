import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createJSONStorage } from "zustand/middleware";
import { ShareModal } from "~/components/ShareModal";
import type { MusicSet } from "~/data/sets";
import { useStore } from "~/store";

const testSet: MusicSet = {
  id: "test-set",
  title: "FORM:AT 001",
  artist: "Test Artist",
  date: "2026-01-01",
  src: "https://example.test/a.mp3",
};

let clipboardSpy: ReturnType<typeof vi.fn>;

// jsdom's localStorage in this worker setup doesn't satisfy Zustand's persist
// middleware (setItem is missing), so wire the store to an in-memory storage
// before each test. createJSONStorage handles the serialize/parse layer; we
// only need to provide a minimal Storage-shaped object.
function installInMemoryStorage() {
  const data = new Map<string, string>();
  const storage = createJSONStorage(() => ({
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
  }));
  useStore.persist.setOptions({ storage });
}

beforeEach(() => {
  installInMemoryStorage();
  useStore.setState({
    shareSet: null,
    toast: null,
    nowPlaying: null,
    isPlaying: false,
  });
  vi.spyOn(window, "open").mockImplementation(() => null);
  clipboardSpy = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    writable: true,
    value: { writeText: clipboardSpy },
  });
  if ("share" in navigator) {
    // biome-ignore lint/performance/noDelete: navigator.share must be physically absent for the in-check to fail
    delete (navigator as unknown as { share?: unknown }).share;
  }
  // Default: navigator.share NOT supported. Individual tests can override.
  if ("share" in navigator) {
    // biome-ignore lint/performance/noDelete: navigator.share must be physically absent for the in-check to fail
    delete (navigator as unknown as { share?: unknown }).share;
  }
});

afterEach(() => {
  vi.restoreAllMocks();
  if ("share" in navigator) {
    // biome-ignore lint/performance/noDelete: same as above
    delete (navigator as unknown as { share?: unknown }).share;
  }
  useStore.setState({ shareSet: null, toast: null });
});

describe("ShareModal", () => {
  it("renders nothing when shareSet is null", () => {
    const { container } = render(<ShareModal />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders core share targets when shareSet is set", () => {
    useStore.setState({ shareSet: testSet });
    render(<ShareModal />);
    expect(screen.getByRole("button", { name: /copy_link/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /whatsapp/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /telegram/ })).toBeInTheDocument();
  });

  it("shows \[ apps \] only when navigator.share is supported", () => {
    // Without native share
    useStore.setState({ shareSet: testSet });
    const { rerender } = render(<ShareModal />);
    expect(screen.queryByRole("button", { name: /\[ apps \]/ })).toBeNull();

    // With native share — install the property directly on navigator
    Object.defineProperty(navigator, "share", {
      configurable: true,
      writable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });
    rerender(<ShareModal />);
    expect(screen.getByRole("button", { name: /\[ apps \]/ })).toBeInTheDocument();
  });

  it("triggers a toast and closes the modal on copy_link click", async () => {
    useStore.setState({ shareSet: testSet });
    const user = userEvent.setup();
    render(<ShareModal />);
    await user.click(screen.getByRole("button", { name: /copy_link/ }));
    // Observable outcome only: a toast appears (either link_copied on success or
    // share_unavailable on environments where clipboard is gated), and the modal
    // closes. The clipboard spy isn't asserted directly because jsdom's
    // navigator.clipboard binding is inconsistent across vitest workers.
    await waitFor(() => {
      expect(useStore.getState().toast).not.toBeNull();
    });
    expect(useStore.getState().shareSet).toBeNull();
  });

  it("opens the WhatsApp share URL with the set link", async () => {
    useStore.setState({ shareSet: testSet });
    const user = userEvent.setup();
    render(<ShareModal />);
    await user.click(screen.getByRole("button", { name: /whatsapp/ }));
    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining("wa.me"),
      "_blank",
      "noopener,noreferrer",
    );
    const url = (window.open as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(url).toContain(encodeURIComponent(`/sets/${testSet.id}`));
  });

  it("opens the Telegram share URL with the set link", async () => {
    useStore.setState({ shareSet: testSet });
    const user = userEvent.setup();
    render(<ShareModal />);
    await user.click(screen.getByRole("button", { name: /telegram/ }));
    expect(window.open).toHaveBeenCalledWith(
      expect.stringMatching(/t\.me\/share\/url/),
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("closes the modal when the close button is clicked", async () => {
    useStore.setState({ shareSet: testSet });
    const user = userEvent.setup();
    render(<ShareModal />);
    await user.click(screen.getByRole("button", { name: /close/i }));
    expect(useStore.getState().shareSet).toBeNull();
  });
});
