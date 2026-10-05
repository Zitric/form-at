import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { GrowthTab } from "~/components/GrowthTab";
import { SAMPLE_ADMIN_DASHBOARD_STATS } from "~/data/sample-stats";

// A TerminalRow is one <p>: "›", then "label: value" as text.
const row = (label: string) =>
  screen.getByText(
    (_, el) => el?.tagName === "P" && (el.textContent ?? "").startsWith(`›${label}: `),
  );

describe("GrowthTab story_funnel", () => {
  it("shows each stage with its rate", () => {
    render(<GrowthTab stats={SAMPLE_ADMIN_DASHBOARD_STATS} />);
    expect(screen.getByText("// story_funnel")).toBeInTheDocument();
    expect(row("create_tap")).toHaveTextContent("5 · 63%");
    expect(row("install_gate (tabs)")).toHaveTextContent("2 · 40%");
    expect(row("created")).toHaveTextContent("3 · 60%");
    expect(row("shared")).toHaveTextContent("2 · 67%");
    expect(row("Unreal @ Form:at 003")).toHaveTextContent("2 / 1 / 3");
    expect(row("link_opens")).toHaveTextContent("4");
  });

  it("drops a rate whose base is 0, rather than showing 0%", () => {
    const stats = {
      ...SAMPLE_ADMIN_DASHBOARD_STATS,
      storyFunnel: {
        ...SAMPLE_ADMIN_DASHBOARD_STATS.storyFunnel,
        createTaps: 0,
        createdRate: null,
        gateRate: null,
      },
    };
    render(<GrowthTab stats={stats} />);
    expect(row("created")?.textContent).not.toContain("%");
  });

  it("says what shared means and where create_tap starts", () => {
    render(<GrowthTab stats={SAMPLE_ADMIN_DASHBOARD_STATS} />);
    expect(
      screen.getByText(/system share sheet completed, not that it was posted/),
    ).toBeInTheDocument();
    expect(screen.getByText(/earlier rows are the operator's\s+own tests/)).toBeInTheDocument();
  });
});
