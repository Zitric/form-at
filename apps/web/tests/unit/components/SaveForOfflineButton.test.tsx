import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SaveForOfflineButton } from "~/components/SaveForOfflineButton";
import type { MusicSet } from "~/data/sets";
import type { SaveGate } from "~/hooks/useSaveGate";

// Mock the gate hook to drive each branch. The SaveGateModal it renders
// internally is exercised via "modal opened" assertions only — its platform-
// specific content has its own coverage if we add it later.
vi.mock("~/hooks/useSaveGate", () => ({
  useSaveGate: vi.fn<() => SaveGate>(() => ({ allow: true })),
  useTriggerInstallPrompt: vi.fn(() => async () => "no-prompt" as const),
}));

// Stub Modal's polyfilled dialog API so jsdom doesn't throw on showModal().
// Mirrors the pattern in tests/setup.ts used by ShareModal tests.
beforeEach(() => {
  if (!HTMLDialogElement.prototype.showModal) {
    HTMLDialogElement.prototype.showModal = function showModal() {
      this.setAttribute("open", "");
    };
    HTMLDialogElement.prototype.close = function close() {
      this.removeAttribute("open");
    };
  }
});

afterEach(() => {
  vi.clearAllMocks();
});

async function withGate(gate: SaveGate) {
  const mod = await import("~/hooks/useSaveGate");
  vi.mocked(mod.useSaveGate).mockReturnValue(gate);
}

// Fixture matching the real sets.ts shape — sizeBytes mirrors the t.i.l. set
// so the `allow: true + not-saved` branch renders a real-looking label.
const fixture: MusicSet = {
  id: "test-set",
  title: "Test Set",
  artist: "test_artist",
  date: "2026-01-01",
  src: "https://example.invalid/test.mp3",
  sizeBytes: 108_761_280,
};

describe("SaveForOfflineButton", () => {
  it("renders the button in a Chromium tab needing install (case a)", async () => {
    await withGate({
      allow: false,
      reason: "needs-install",
      platform: "chromium",
      canPrompt: true,
    });
    render(<SaveForOfflineButton set={fixture} />);
    expect(screen.getByRole("button", { name: /save_for_offline/ })).toBeInTheDocument();
  });

  it("renders the button on iOS Safari tab needing install (case a, manual path)", async () => {
    await withGate({
      allow: false,
      reason: "needs-install",
      platform: "ios-safari",
      canPrompt: false,
    });
    render(<SaveForOfflineButton set={fixture} />);
    expect(screen.getByRole("button", { name: /save_for_offline/ })).toBeInTheDocument();
  });

  it("renders the button on a tab where the PWA is already installed (case b)", async () => {
    await withGate({ allow: false, reason: "open-app" });
    render(<SaveForOfflineButton set={fixture} />);
    expect(screen.getByRole("button", { name: /save_for_offline/ })).toBeInTheDocument();
  });

  it("renders the button on a browser that cannot install (case c)", async () => {
    await withGate({ allow: false, reason: "cannot-install" });
    render(<SaveForOfflineButton set={fixture} />);
    expect(screen.getByRole("button", { name: /save_for_offline/ })).toBeInTheDocument();
  });

  it("renders the size hint in the label when allowed + not-saved (standalone state machine)", async () => {
    await withGate({ allow: true });
    render(<SaveForOfflineButton set={fixture} />);
    // 108_761_280 bytes → ~109MB (rounded). Asserting via regex on the
    // bracketed label so future label tweaks don't break the test if the
    // size formatter is still showing the value.
    expect(screen.getByRole("button", { name: /save_for_offline · \d+MB/ })).toBeInTheDocument();
  });

  it("hides itself entirely while the gate is pre-hydration (pending)", async () => {
    await withGate({ allow: false, reason: "pending" });
    const { container } = render(<SaveForOfflineButton set={fixture} />);
    // Component returns null — nothing renders.
    expect(container.firstChild).toBeNull();
  });

  it("opens the gate modal on click in a tab (gate blocks the download path)", async () => {
    await withGate({
      allow: false,
      reason: "needs-install",
      platform: "chromium",
      canPrompt: true,
    });
    render(<SaveForOfflineButton set={fixture} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /save_for_offline/ }));
    // Modal renders its `save_for_offline` title once open.
    const headings = await screen.findAllByText(/save_for_offline/);
    expect(headings.length).toBeGreaterThan(1); // button + modal title
  });
});
