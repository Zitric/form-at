import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DevModeBanner } from "~/components/DevModeBanner";
import { isDevModeActive } from "~/utils/devMode";

// Locks the two safety properties the operator explicitly asked for:
// default OFF (no banner, no localStorage write, unless `?devmode=on` was
// visited deliberately), and visible-while-active with no way to hide the
// banner except actually disabling dev mode (never a dismiss-only state —
// see the component's own header comment for why).

function setUrl(search: string) {
  window.history.pushState({}, "", `/${search}`);
}

beforeEach(() => {
  window.localStorage.clear();
  setUrl("");
});

afterEach(() => {
  window.localStorage.clear();
});

describe("DevModeBanner", () => {
  it("renders nothing by default — no query param, no stored flag", () => {
    render(<DevModeBanner />);
    expect(screen.queryByText(/dev_mode/)).not.toBeInTheDocument();
    expect(isDevModeActive()).toBe(false);
  });

  it("?devmode=on shows the banner AND persists the flag to localStorage", () => {
    setUrl("?devmode=on");
    render(<DevModeBanner />);
    expect(
      screen.getByText(/dev_mode — plays from this browser are not counted/),
    ).toBeInTheDocument();
    expect(isDevModeActive()).toBe(true);
  });

  it("a later mount with no query param still shows the banner — the flag persisted, not just the one-time trigger", () => {
    setUrl("?devmode=on");
    const { unmount } = render(<DevModeBanner />);
    unmount();

    setUrl("");
    render(<DevModeBanner />);
    expect(screen.getByText(/dev_mode/)).toBeInTheDocument();
  });

  it("?devmode=off clears an active flag and hides the banner", () => {
    setUrl("?devmode=on");
    render(<DevModeBanner />).unmount();
    expect(isDevModeActive()).toBe(true);

    setUrl("?devmode=off");
    render(<DevModeBanner />);
    expect(screen.queryByText(/dev_mode/)).not.toBeInTheDocument();
    expect(isDevModeActive()).toBe(false);
  });

  it("the disable button turns dev mode off entirely — not a dismiss-only hide", async () => {
    const user = userEvent.setup();
    setUrl("?devmode=on");
    render(<DevModeBanner />);
    expect(isDevModeActive()).toBe(true);

    await user.click(screen.getByRole("button", { name: /disable dev mode/i }));

    expect(screen.queryByText(/dev_mode/)).not.toBeInTheDocument();
    expect(isDevModeActive()).toBe(false);
  });
});
