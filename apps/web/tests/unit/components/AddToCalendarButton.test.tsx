import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AddToCalendarButton } from "~/components/AddToCalendarButton";
import { events } from "~/data/events";

// calendar_add_click: all
// three destinations must fire the same event, carrying no set_id — same
// beacon-assertion convention as shareButtons.test.tsx.

const event = events[0];
if (!event) throw new Error("catalogue empty");

beforeEach(() => {
  vi.spyOn(navigator, "sendBeacon").mockReturnValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function openModal() {
  await userEvent.setup().click(screen.getByRole("button", { name: /add_to_calendar/i }));
  return userEvent.setup();
}

describe("calendar_add_click tracking", () => {
  it("fires calendar_add_click with no set_id when the google option is clicked", async () => {
    render(<AddToCalendarButton event={event} />);
    const user = await openModal();
    const beaconSpy = navigator.sendBeacon as ReturnType<typeof vi.fn>;

    await user.click(screen.getByRole("link", { name: /google/i }));

    expect(beaconSpy).toHaveBeenCalledWith("/api/event", expect.anything());
    const [, blob] = beaconSpy.mock.calls[0] as [string, Blob];
    expect(JSON.parse(await blob.text())).toMatchObject({
      event_type: "calendar_add_click",
      set_id: null,
    });
  });

  it("fires calendar_add_click when the outlook option is clicked", async () => {
    render(<AddToCalendarButton event={event} />);
    const user = await openModal();
    const beaconSpy = navigator.sendBeacon as ReturnType<typeof vi.fn>;

    await user.click(screen.getByRole("link", { name: /outlook/i }));

    const [, blob] = beaconSpy.mock.calls[0] as [string, Blob];
    expect(JSON.parse(await blob.text())).toMatchObject({ event_type: "calendar_add_click" });
  });

  it("fires calendar_add_click when the .ics option is clicked", async () => {
    // jsdom has no real Blob download machinery — stub the bits downloadIcs
    // touches so the click completes without throwing.
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    render(<AddToCalendarButton event={event} />);
    const user = await openModal();
    const beaconSpy = navigator.sendBeacon as ReturnType<typeof vi.fn>;

    await user.click(screen.getByRole("button", { name: /apple.*ics/i }));

    const [, blob] = beaconSpy.mock.calls[0] as [string, Blob];
    expect(JSON.parse(await blob.text())).toMatchObject({ event_type: "calendar_add_click" });
  });
});
