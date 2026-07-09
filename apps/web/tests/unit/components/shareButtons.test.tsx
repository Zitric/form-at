import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ShareIconButton } from "~/components/ShareIconButton";
import { ShareSetButton } from "~/components/ShareSetButton";
import { sets } from "~/data/sets";

// share_click (2026-07-08): both share surfaces (list-card icon + detail
// page text button) must fire the event before opening the share modal.

const track = sets[0];
if (!track) throw new Error("catalogue empty");

beforeEach(() => {
  vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("share_click tracking", () => {
  it("ShareIconButton fires share_click on tap", async () => {
    render(<ShareIconButton set={track} />);
    const beaconSpy = navigator.sendBeacon as ReturnType<typeof vi.fn>;

    await userEvent.setup().click(screen.getByRole("button", { name: /share/i }));

    expect(beaconSpy).toHaveBeenCalledWith("/api/event", expect.anything());
    const [, blob] = beaconSpy.mock.calls[0] as [string, Blob];
    expect(JSON.parse(await blob.text())).toMatchObject({
      event_type: "share_click",
      set_id: track.id,
    });
  });

  it("ShareSetButton fires share_click on tap", async () => {
    render(<ShareSetButton set={track} />);
    const beaconSpy = navigator.sendBeacon as ReturnType<typeof vi.fn>;

    await userEvent.setup().click(screen.getByRole("button", { name: /share_set/i }));

    expect(beaconSpy).toHaveBeenCalledWith("/api/event", expect.anything());
    const [, blob] = beaconSpy.mock.calls[0] as [string, Blob];
    expect(JSON.parse(await blob.text())).toMatchObject({
      event_type: "share_click",
      set_id: track.id,
    });
  });
});
