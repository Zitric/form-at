import { sets } from "@form-at/data/sets";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { PlaybackErrorToast } from "~/components/player/PlaybackErrorToast";
import { useStore } from "~/store";

// Locks the blocked-tap visibility rule (TECH_DEBT 17 follow-up,
// 2026-07-02): the playTrack offline gate fires BEFORE a track is attached,
// so on a fresh session's first blocked tap `nowPlaying` is still null. The
// toast must render for blocked reasons regardless — requiring nowPlaying
// made the tap fail silently. Generic errors (no blocked reason) still need
// a loaded track for context.

beforeEach(() => {
  useStore.setState({ hasError: false, playbackBlockedReason: null, nowPlaying: null });
});

describe("PlaybackErrorToast", () => {
  it("shows the tab-offline message even when no track is loaded (blocked first tap)", () => {
    useStore.setState({ hasError: true, playbackBlockedReason: "tab-offline-needs-network" });
    render(<PlaybackErrorToast />);
    expect(screen.getByText(/open the app to listen offline/i)).toBeInTheDocument();
  });

  it("shows the not-saved message without a track in standalone", () => {
    useStore.setState({ hasError: true, playbackBlockedReason: "not-saved-offline" });
    render(<PlaybackErrorToast />);
    expect(screen.getByText(/not saved for offline listening/i)).toBeInTheDocument();
  });

  it("stays hidden for a generic error with no track loaded", () => {
    useStore.setState({ hasError: true, playbackBlockedReason: null, nowPlaying: null });
    const { container } = render(<PlaybackErrorToast />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a generic error when a track IS loaded", () => {
    const track = sets[0];
    if (!track) throw new Error("catalogue empty");
    useStore.setState({ hasError: true, playbackBlockedReason: null, nowPlaying: track });
    render(<PlaybackErrorToast />);
    expect(screen.getByText(/playback error/i)).toBeInTheDocument();
  });
});
