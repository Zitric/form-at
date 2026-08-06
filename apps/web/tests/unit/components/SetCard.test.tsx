import type { MusicSet } from "@form-at/data/sets";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SetCard } from "~/components/SetCard";
import { useStore } from "~/store";
import { registerAudioElement } from "~/store/playerSlice";

// Locks the unification (PWA_PROGRESS "Set card abstraction"): both
// `/sets/index.tsx` and `/djs/$djId.tsx` must render THIS component, so parity
// is structural — there is only one action-slot implementation to get wrong.

vi.mock("~/hooks/useSaveGate", () => ({
  useSaveGate: () => ({ allow: true }),
}));

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return { ...actual, useNavigate: () => navigateMock };
});

const fixture: MusicSet = {
  id: "test-set",
  title: "Test Set",
  artist: "test_artist",
  date: "2026-01-01",
  src: "https://example.invalid/test.mp3",
};

let audio: HTMLAudioElement;

beforeEach(() => {
  audio = new Audio();
  registerAudioElement(audio);
  navigateMock.mockClear();
  useStore.setState({ nowPlaying: null, isPlaying: false });
});

afterEach(() => {
  registerAudioElement(null);
  vi.clearAllMocks();
});

describe("SetCard — action-slot parity (the actual bug fix)", () => {
  it("always renders save-for-offline, share, AND play controls together", () => {
    render(<SetCard set={fixture} index={0} />);
    expect(
      screen.getByRole("button", { name: /save .* for offline listening/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /share/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /play set/i })).toBeInTheDocument();
  });
});

describe("SetCard — body content", () => {
  it("renders artist, title, and date (both the mobile and sm+ layouts, same underlying data)", () => {
    render(<SetCard set={fixture} index={0} />);
    // Mobile layout splits artist/title/date across three lines; sm+ mode
    // combines them — both are present in the DOM simultaneously (Tailwind
    // breakpoint classes, not conditional rendering), so both text shapes
    // should resolve regardless of viewport in a jsdom test.
    expect(screen.getAllByText(/test_artist/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Test Set/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/2026-01-01/i).length).toBeGreaterThan(0);
  });
});

describe("SetCard — navigation and playback wiring", () => {
  it("clicking the card body navigates to the set detail page", async () => {
    render(<SetCard set={fixture} index={0} />);
    // The outer card is the div[role=button] (Card falls back to that shape
    // once it has a nested `action` — see Card.tsx). Query by role name to
    // get the whole-surface tap target, not a specific inner icon button.
    const cardSurface = screen.getAllByRole("button").find((b) => b.tagName !== "BUTTON");
    expect(cardSurface).toBeDefined();
    await userEvent.setup().click(cardSurface as HTMLElement);
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/sets/$setId",
      params: { setId: "test-set" },
    });
  });

  it("clicking the play button calls playTrack with this set, not a navigation", async () => {
    render(<SetCard set={fixture} index={0} />);
    await userEvent.setup().click(screen.getByRole("button", { name: /play set/i }));
    expect(useStore.getState().nowPlaying?.id).toBe("test-set");
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("reflects isThisPlaying from the store — shows Pause when this set is the one playing", () => {
    useStore.setState({ nowPlaying: fixture, isPlaying: true });
    render(<SetCard set={fixture} index={0} />);
    expect(screen.getByRole("button", { name: /pause set/i })).toBeInTheDocument();
  });

  it("does not show Pause when a DIFFERENT set is playing", () => {
    useStore.setState({ nowPlaying: { ...fixture, id: "other-set" }, isPlaying: true });
    render(<SetCard set={fixture} index={0} />);
    expect(screen.getByRole("button", { name: /play set/i })).toBeInTheDocument();
  });
});
