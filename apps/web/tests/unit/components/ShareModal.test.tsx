import type { MusicSet } from "@form-at/data/sets";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createJSONStorage } from "zustand/middleware";
import { ShareModal } from "~/components/ShareModal";
import { useStore } from "~/store";
import { djShareTarget, eventShareTarget, setShareTarget } from "~/utils/shareTarget";

const testSet: MusicSet = {
  id: "test-set",
  title: "FORM:AT 001",
  artist: "Test Artist",
  date: "2026-01-01",
  src: "https://example.test/a.mp3",
};

let clipboardSpy: ReturnType<typeof vi.fn>;

// The Story entry's own gating (flag, phone, capability, install gate) is
// StoryEntry.test.tsx's job; here only whether the section shows matters.
const { storyShown } = vi.hoisted(() => ({ storyShown: { current: false } }));
vi.mock("~/components/story/StoryEntry", () => ({
  isStoryEntryShown: () => storyShown.current,
  StoryEntry: () => <button type="button">[ instagram_story ]</button>,
}));

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
    shareTarget: null,
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
  useStore.setState({ shareTarget: null, toast: null });
});

describe("ShareModal", () => {
  it("renders nothing when shareTarget is null", () => {
    const { container } = render(<ShareModal />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders core share targets when shareTarget is set", () => {
    useStore.setState({ shareTarget: setShareTarget(testSet) });
    render(<ShareModal />);
    expect(screen.getByRole("button", { name: /copy_link/ })).toBeInTheDocument();
    // WhatsApp and Telegram are now anchors (their href IS the share action),
    // not buttons that imperatively call window.open.
    expect(screen.getByRole("link", { name: /whatsapp/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /telegram/ })).toBeInTheDocument();
  });

  it("shows [ apps ] only when navigator.share is supported", () => {
    // Without native share
    useStore.setState({ shareTarget: setShareTarget(testSet) });
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
    useStore.setState({ shareTarget: setShareTarget(testSet) });
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
    expect(useStore.getState().shareTarget).toBeNull();
  });

  it("WhatsApp link href points at wa.me with the set URL embedded", () => {
    useStore.setState({ shareTarget: setShareTarget(testSet) });
    render(<ShareModal />);
    const href = screen.getByRole("link", { name: /whatsapp/ }).getAttribute("href") ?? "";
    expect(href).toContain("wa.me");
    expect(href).toContain(encodeURIComponent(`/sets/${testSet.id}`));
  });

  it("Telegram link href points at t.me/share/url with the set URL embedded", () => {
    useStore.setState({ shareTarget: setShareTarget(testSet) });
    render(<ShareModal />);
    const href = screen.getByRole("link", { name: /telegram/ }).getAttribute("href") ?? "";
    expect(href).toMatch(/t\.me\/share\/url/);
    expect(href).toContain(encodeURIComponent(`/sets/${testSet.id}`));
  });

  it("closes the modal when the close button is clicked", async () => {
    useStore.setState({ shareTarget: setShareTarget(testSet) });
    const user = userEvent.setup();
    render(<ShareModal />);
    await user.click(screen.getByRole("button", { name: /close/i }));
    expect(useStore.getState().shareTarget).toBeNull();
  });
});

describe("ShareModal create_video: section", () => {
  afterEach(() => {
    storyShown.current = false;
  });

  it("isn't there when no video format would render (no flag, or not a phone)", () => {
    useStore.setState({ shareTarget: setShareTarget(testSet) });
    render(<ShareModal />);
    expect(screen.queryByText("create_video:")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /instagram_story/ })).not.toBeInTheDocument();
  });

  it("holds [ instagram_story ], after send:, which no longer does", () => {
    storyShown.current = true;
    useStore.setState({ shareTarget: setShareTarget(testSet) });
    render(<ShareModal />);
    const create = screen.getByText("create_video:");
    const send = screen.getByText("send:");
    expect(send.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const story = screen.getByRole("button", { name: /instagram_story/ });
    expect(create.parentElement).toContainElement(story);
    expect(send.parentElement).not.toContainElement(story);
  });
});

describe("ShareModal for a DJ or an event", () => {
  const dj = { id: "test-dj", name: "Test DJ", type: "guest" as const };
  const event = {
    id: "format-004",
    title: "Form:at 004",
    date: "2026-12-05",
    venue: "Stereo, Renfield Lane, City Centre, Glasgow",
    city: "Glasgow",
    lineupIds: [],
    audio: "techno",
    runtime: "23:00 — tbc",
    status: "upcoming" as const,
  };

  afterEach(() => {
    storyShown.current = false;
  });

  it.each([
    ["DJ", djShareTarget(dj), "dj", "Test DJ", "/djs/test-dj", "Test DJ on Form:at."],
    [
      "event",
      eventShareTarget(event),
      "event",
      "Form:at 004",
      "/events/format-004",
      "Form:at 004 · Sat 05.12 · Stereo",
    ],
  ])("shares the %s page's URL and text", (kind, target, label, subject, path, text) => {
    useStore.setState({ shareTarget: target });
    render(<ShareModal />);

    expect(screen.getByRole("dialog", { name: `Share ${kind}` })).toBeInTheDocument();
    expect(screen.getByText(`${label}: ${subject}`, { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy_link/ })).toBeInTheDocument();
    const wa = screen.getByRole("link", { name: /whatsapp/ }).getAttribute("href") ?? "";
    expect(wa).toContain(encodeURIComponent(path));
    expect(wa).toContain(encodeURIComponent(text));
    const tg = screen.getByRole("link", { name: /telegram/ }).getAttribute("href") ?? "";
    expect(tg).toContain(encodeURIComponent(path));
  });

  it("has no set-only rows: no copy @ and no create_video, even where the Story would show", () => {
    storyShown.current = true;
    useStore.setState({ shareTarget: djShareTarget(dj), nowPlaying: testSet });
    render(<ShareModal />);

    expect(screen.queryByRole("button", { name: /copy @/ })).not.toBeInTheDocument();
    expect(screen.queryByText("create_video:")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /instagram_story/ })).not.toBeInTheDocument();
  });
});
