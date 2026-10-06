import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InAppBrowserBanner } from "~/components/InAppBrowserBanner";

vi.mock("~/hooks/useNavReady", () => ({ useNavReady: () => true }));
vi.mock("~/store", () => ({
  useStore: (selector: (s: { nowPlaying: null }) => unknown) => selector({ nowPlaying: null }),
}));

const UA = {
  instagramAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-S916U Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/119.0.6045.66 Mobile Safari/537.36 Instagram 309.0.0.40.113 Android (34/14; 510dpi; 1080x2113; samsung; SM-S916U; dm2q; qcom; en_US; 536988425)",
  instagramIOS:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 348.0.0.31.106 (iPhone15,3; iOS 17_5; en_GB; en-GB; scale=3.00; 1290x2796; 612234217)",
  facebookAndroid:
    "Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230805.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.5845.163 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/430.0.0.23.113;]",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36",
};

function withUserAgent(ua: string) {
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(ua);
}

afterEach(() => {
  vi.restoreAllMocks();
  sessionStorage.clear();
});

describe("InAppBrowserBanner", () => {
  // The bug: Android got the iPhone copy.
  it("on Android, says to open it in the browser from the ⋮ menu — never Safari", async () => {
    withUserAgent(UA.instagramAndroid);
    render(<InAppBrowserBanner />);
    expect(
      await screen.findByText("for full audio: tap ⋮ and open in browser"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/safari/i)).toBeNull();
  });

  it("does the same in Facebook's Android browser", async () => {
    withUserAgent(UA.facebookAndroid);
    render(<InAppBrowserBanner />);
    expect(
      await screen.findByText("for full audio: tap ⋮ and open in browser"),
    ).toBeInTheDocument();
  });

  it("on iOS, says to open it in Safari from the ⋯ menu", async () => {
    withUserAgent(UA.instagramIOS);
    render(<InAppBrowserBanner />);
    expect(await screen.findByText("for full audio: tap ⋯ and open in safari")).toBeInTheDocument();
  });

  it("shows nothing in a real browser", () => {
    withUserAgent(UA.chromeAndroid);
    const { container } = render(<InAppBrowserBanner />);
    expect(container).toBeEmptyDOMElement();
  });
});
