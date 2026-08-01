import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

// jsdom doesn't implement ResizeObserver — @visx/responsive's ParentSize
// (used by TrendChart) needs one to measure its container. Unlike jsdom's
// missing canvas 2D context (a native-binding gap this repo has never
// polyfilled), ResizeObserver is trivial to stub: a no-op is sufficient
// since tests don't depend on real resize behavior, only that mounting
// doesn't throw.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
