import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TrendChart } from "~/components/TrendChart";
import { HEIGHT } from "~/components/TrendChartInner";

// TrendChart lazy-loads TrendChartInner (all of visx) via a real dynamic
// import — these tests exercise the resolved, real chart, not a mock, since
// jsdom renders plain SVG natively (no canvas-context mocking needed, unlike
// a canvas-based library would require).
//
// A field bug slipped past the original version of this file: it only
// asserted an <svg> existed, never that it (or its container) had real
// dimensions. The actual bug — the chart's wrapping div had no explicit
// height, so @visx/responsive's ParentSize sized its own wrapper to
// `height: 100%` of an auto-height ancestor, which resolves to 0 — collapsed
// the container to zero height in a real browser, so later siblings painted
// over the chart even though the SVG and its bars had correct internal
// dimensions the whole time. jsdom doesn't compute real CSS layout (every
// element's getBoundingClientRect is always zero, buggy or not), so no
// jsdom-only assertion can catch a collapsed-container regression by
// itself — that's what tests/e2e/dashboard.spec.ts's bounding-box
// assertions are for. What jsdom CAN verify directly, without layout, is
// that the fix's actual mechanism — an explicit inline `height` style — is
// present on the container, since that's a literal DOM property read, not
// a computed one.
describe("TrendChart", () => {
  it("gives the chart container an explicit height (regression guard for the collapsed-container bug)", async () => {
    render(<TrendChart data={[1, 2, 3, 4, 5, 6, 7, 8, 9]} />);
    const container = await screen.findByTestId("trend-chart");
    expect(container.style.height).toBe(`${HEIGHT}px`);
  });

  it("renders one bar per data point for a typical 9-point weekly trend", async () => {
    render(<TrendChart data={[1, 2, 3, 4, 5, 6, 7, 8, 9]} />);
    expect(await screen.findAllByTestId("chart-bar")).toHaveLength(9);
    expect(screen.getByText(/9 weeks, latest 9, peak 9/i)).toBeInTheDocument();
  });

  it("renders a single-point trend as one bar", async () => {
    render(<TrendChart data={[42]} />);
    expect(await screen.findAllByTestId("chart-bar")).toHaveLength(1);
    expect(screen.getByText(/1 weeks, latest 42, peak 42/i)).toBeInTheDocument();
  });

  it("renders an all-zero trend as a real chart frame, not a 'no data' message — with an explicit note so it doesn't read as broken", async () => {
    render(<TrendChart data={[0, 0, 0, 0]} />);
    // Deliberately distinct from empty: a real window WAS tracked and
    // genuinely nothing happened, which is different from "never tracked".
    expect(await screen.findAllByTestId("chart-bar")).toHaveLength(4);
    expect(screen.queryByText(/no data in this window/i)).not.toBeInTheDocument();
    // The frame alone reads as broken next to a nonzero number elsewhere on
    // the card — this note is what makes the flatness read as deliberate.
    expect(await screen.findByText(/no activity in this window/i)).toBeInTheDocument();
    const container = await screen.findByTestId("trend-chart");
    expect(container.style.height).toBe(`${HEIGHT}px`);
  });

  it("does not show the all-zero note for a trend that has real activity", async () => {
    render(<TrendChart data={[1, 2, 3, 4, 5, 6, 7, 8, 9]} />);
    await screen.findAllByTestId("chart-bar");
    expect(screen.queryByText(/no activity in this window/i)).not.toBeInTheDocument();
  });

  it("y-axis ticks are integers only, and a small range doesn't over-produce ticks", async () => {
    // max value 2 — the exact case that regressed to 5 fractional ticks
    // (0, 0.5, 1, 1.5, 2) under d3's default "nice step" tick generation.
    const { container } = render(<TrendChart data={[0, 1, 1, 1, 2, 1, 2, 2, 1]} />);
    await screen.findAllByTestId("chart-bar");
    const svg = container.querySelector("svg");
    const tickTexts = Array.from(svg?.querySelectorAll("text") ?? [])
      .map((t) => t.textContent ?? "")
      .filter((text) => /^\d+(\.\d+)?$/.test(text)); // numeric ticks only, not date ticks
    expect(tickTexts).toEqual(["0", "1", "2"]);
  });

  it("renders an explicit 'no data' message for an empty trend, not a near-blank chart frame", async () => {
    render(<TrendChart data={[]} />);
    expect(await screen.findByText(/no data in this window/i)).toBeInTheDocument();
    expect(screen.queryByTestId("chart-bar")).not.toBeInTheDocument();
    // Same reserved height as the real-chart branch — switching between an
    // empty set and one with data shouldn't reflow the page either.
    const container = await screen.findByTestId("trend-chart");
    expect(container.style.height).toBe(`${HEIGHT}px`);
  });
});
