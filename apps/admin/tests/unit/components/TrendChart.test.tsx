import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TrendChart } from "~/components/TrendChart";

// TrendChart lazy-loads TrendChartInner (all of visx) via a real dynamic
// import — these tests exercise the resolved, real chart, not a mock, since
// jsdom renders plain SVG natively (no canvas-context mocking needed, unlike
// a canvas-based library would require).
describe("TrendChart", () => {
  it("renders a typical 9-point weekly trend without throwing", async () => {
    render(<TrendChart data={[1, 2, 3, 4, 5, 6, 7, 8, 9]} />);
    expect(await screen.findByText(/9 weeks, latest 9, peak 9/i)).toBeInTheDocument();
  });

  it("renders an empty trend without throwing", async () => {
    render(<TrendChart data={[]} />);
    expect(await screen.findByText(/0 weeks, latest 0, peak 0/i)).toBeInTheDocument();
  });

  it("renders a single-point trend without throwing", async () => {
    render(<TrendChart data={[42]} />);
    expect(await screen.findByText(/1 weeks, latest 42, peak 42/i)).toBeInTheDocument();
  });

  it("renders an all-zero trend without throwing", async () => {
    render(<TrendChart data={[0, 0, 0, 0]} />);
    expect(await screen.findByText(/4 weeks, latest 0, peak 0/i)).toBeInTheDocument();
  });
});
