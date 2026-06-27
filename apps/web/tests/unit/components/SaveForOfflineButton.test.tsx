import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SaveForOfflineButton } from "~/components/SaveForOfflineButton";
import type { MusicSet } from "~/data/sets";

// Mock the capability hook to drive each branch. The InstallPromptModal it
// renders internally is exercised via "modal opened" assertions only — its
// platform-specific content has its own coverage if we add it later.
vi.mock("~/hooks/useInstallCapability", () => ({
  useInstallCapability: vi.fn(() => "native"),
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

async function withCapability(
  cap: "native" | "chromium-manual" | "ios-safari" | "installed" | "unsupported",
) {
  const mod = await import("~/hooks/useInstallCapability");
  vi.mocked(mod.useInstallCapability).mockReturnValue(cap);
}

// Fixture matching the real sets.ts shape — sizeBytes mirrors the t.i.l. set
// so the `installed + not-saved` branch renders a real-looking label.
const fixture: MusicSet = {
  id: "test-set",
  title: "Test Set",
  artist: "test_artist",
  date: "2026-01-01",
  src: "https://example.invalid/test.mp3",
  sizeBytes: 108_761_280,
};

describe("SaveForOfflineButton", () => {
  it("renders the button on Chromium with native install available", async () => {
    await withCapability("native");
    render(<SaveForOfflineButton set={fixture} />);
    expect(screen.getByRole("button", { name: /save_for_offline/ })).toBeInTheDocument();
  });

  it("renders the button on iOS Safari (manual install path)", async () => {
    await withCapability("ios-safari");
    render(<SaveForOfflineButton set={fixture} />);
    expect(screen.getByRole("button", { name: /save_for_offline/ })).toBeInTheDocument();
  });

  it("renders the button on Chromium without a captured prompt (engagement heuristic not met yet)", async () => {
    await withCapability("chromium-manual");
    render(<SaveForOfflineButton set={fixture} />);
    expect(screen.getByRole("button", { name: /save_for_offline/ })).toBeInTheDocument();
  });

  it("renders the size hint in the label when installed + not-saved (3c state machine)", async () => {
    await withCapability("installed");
    render(<SaveForOfflineButton set={fixture} />);
    // 108_761_280 bytes → ~109MB (rounded). Asserting via regex on the
    // bracketed label so future label tweaks don't break the test if the
    // size formatter is still showing the value.
    expect(screen.getByRole("button", { name: /save_for_offline · \d+MB/ })).toBeInTheDocument();
  });

  it("hides itself entirely when capability is 'unsupported'", async () => {
    await withCapability("unsupported");
    const { container } = render(<SaveForOfflineButton set={fixture} />);
    // Component returns null — nothing renders.
    expect(container.firstChild).toBeNull();
  });

  it("opens the install modal on click when capable-but-not-installed (install gates download)", async () => {
    await withCapability("native");
    render(<SaveForOfflineButton set={fixture} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /save_for_offline/ }));
    // Modal renders its `install_for_offline` title once open.
    expect(await screen.findByText(/install_for_offline/)).toBeInTheDocument();
  });
});
