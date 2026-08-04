import { fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Image } from "~/components/Image";

// Admin set-upload feature (PR4): a set with no optimized AVIF/WebP variants
// (true for every uploaded set until PR5 teaches optimize-images.mjs to
// generate them) must fall back to the plain original — as a real state-tree
// swap, not a `src` mutation (a sibling <source> would keep winning). Also
// covers the pre-hydration race: jsdom never actually decodes image bytes
// here (no `canvas` package installed), so `.complete`/`.naturalWidth`
// don't reach a "failed" state on their own — the mount-effect case below
// simulates it explicitly via Object.defineProperty.

describe("Image — optimized-variant fallback", () => {
  it("renders the optimized <picture> tree by default", () => {
    const { container } = render(
      <Image
        src="sets/set-003"
        alt="artwork"
        sizes="100vw"
        originalUrl="https://cdn.example.com/original.jpg"
      />,
    );
    expect(container.querySelector("picture")).not.toBeNull();
    expect(container.querySelectorAll("source")).toHaveLength(2);
  });

  it("replaces the whole <picture>/<source> subtree with a bare <img src={originalUrl}> on error", () => {
    const originalUrl = "https://cdn.example.com/sets/set-003/artwork.jpg";
    const { container, getByAltText } = render(
      <Image src="sets/set-003" alt="artwork" sizes="100vw" originalUrl={originalUrl} />,
    );

    fireEvent.error(getByAltText("artwork"));

    expect(container.querySelector("picture")).toBeNull();
    expect(container.querySelectorAll("source")).toHaveLength(0);
    const img = getByAltText("artwork") as HTMLImageElement;
    expect(img.tagName).toBe("IMG");
    expect(img.src).toBe(originalUrl);
  });

  it("renders nothing on error when no originalUrl is provided (DJ-photo / event-flyer callers)", () => {
    const { container, getByAltText } = render(
      <Image src="djs/some-dj" alt="dj photo" sizes="64px" />,
    );

    fireEvent.error(getByAltText("dj photo"));

    expect(container.innerHTML).toBe("");
  });

  // Regression: FullPlayer renders one <Image> against `nowPlaying.artwork`,
  // which changes as the user moves between tracks WITHOUT the component
  // unmounting (same type, same position — React preserves its state). A
  // fix-less version of this component let a single failure poison every
  // later, perfectly-fine src shown in that same slot for the rest of the
  // session — confirmed by reproducing it (render, fail, re-render with a
  // different src, the fallback stayed stuck) before writing the fix.
  it("recovers for a later, different src after an earlier src failed (no state leak across props)", () => {
    const { container, rerender, getByAltText } = render(
      <Image src="sets/set-A" alt="artwork" sizes="100vw" />,
    );

    fireEvent.error(getByAltText("artwork"));
    expect(container.querySelector("picture")).toBeNull();

    rerender(<Image src="sets/set-B" alt="artwork" sizes="100vw" />);

    expect(container.querySelector("picture")).not.toBeNull();
    expect(container.querySelectorAll("source")).toHaveLength(2);
  });

  it("does NOT reset the failed state on a re-render with the SAME src (only a real src change recovers)", () => {
    const { container, rerender, getByAltText } = render(
      <Image src="sets/set-A" alt="artwork" sizes="100vw" />,
    );

    fireEvent.error(getByAltText("artwork"));
    expect(container.querySelector("picture")).toBeNull();

    rerender(<Image src="sets/set-A" alt="artwork" sizes="100vw" priority />);

    expect(container.querySelector("picture")).toBeNull();
  });

  // Simulates the pre-hydration race: an image that had already failed
  // (browser tried and failed before hydration ever attached `onError`) —
  // `.complete === true` + `.naturalWidth === 0` is the standard signal for
  // that, checked in a mount effect independent of `onError` ever firing.
  // jsdom never actually decodes image bytes (no `canvas` package here), so
  // `.complete`/`.naturalWidth` can't reach a "failed" state on their own —
  // spying on the prototype getters simulates the browser having already
  // tried and failed before this component's effect ever ran.
  describe("mount-effect fallback (pre-hydration race)", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("falls back on mount when the image already failed before hydration attached onError", () => {
      vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
      vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(0);
      const originalUrl = "https://cdn.example.com/sets/set-003/artwork.jpg";

      const { container } = render(
        <Image src="sets/set-003" alt="artwork" sizes="100vw" originalUrl={originalUrl} />,
      );

      expect(container.querySelector("picture")).toBeNull();
      expect(container.querySelector("img")?.src).toBe(originalUrl);
    });

    it("does NOT fall back on mount for a normally-loading (not-yet-complete) image", () => {
      vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(false);

      const { container } = render(<Image src="sets/set-003" alt="artwork" sizes="100vw" />);

      expect(container.querySelector("picture")).not.toBeNull();
    });
  });
});
