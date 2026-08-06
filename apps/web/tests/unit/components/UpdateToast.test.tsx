import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UpdateToast } from "~/components/UpdateToast";
import { useStore } from "~/store";

// Affordance shape lock — a plain text pill doesn't read as tappable.
// The action must be a REAL button whose
// accessible name carries the bracketed CTA.

const applyUpdate = vi.fn();
vi.mock("~/hooks/useSwUpdate", () => ({
  useSwUpdate: () => ({ updateReady: true, applyUpdate }),
}));

describe("UpdateToast", () => {
  it("renders a real button with the bracketed update action", () => {
    useStore.setState({ activeDownloadId: null });
    render(<UpdateToast />);

    const button = screen.getByRole("button", { name: /new version ready.*update/i });
    expect(button.tagName).toBe("BUTTON");
    button.click();
    expect(applyUpdate).toHaveBeenCalledTimes(1);
  });

  it("stays hidden while a set download is in flight", () => {
    useStore.setState({ activeDownloadId: "set-002" });
    const { container } = render(<UpdateToast />);
    expect(container).toBeEmptyDOMElement();
  });
});
