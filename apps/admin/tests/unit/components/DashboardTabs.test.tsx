import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { type DashboardTabId, DashboardTabs } from "~/components/DashboardTabs";

function Harness() {
  const [active, setActive] = useState<DashboardTabId>("growth");
  return (
    <>
      <DashboardTabs active={active} onChange={setActive} />
      <p data-testid="active-tab">{active}</p>
    </>
  );
}

describe("DashboardTabs", () => {
  it("renders all three tabs", () => {
    render(<Harness />);
    expect(screen.getByRole("tab", { name: /growth/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /usage/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /sets/i })).toBeInTheDocument();
  });

  it("marks the active tab as selected", () => {
    render(<Harness />);
    expect(screen.getByRole("tab", { name: /growth/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /usage/i })).toHaveAttribute("aria-selected", "false");
  });

  it("switches the active tab on click", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("tab", { name: /usage/i }));
    expect(screen.getByTestId("active-tab")).toHaveTextContent("usage");
    expect(screen.getByRole("tab", { name: /usage/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /growth/i })).toHaveAttribute("aria-selected", "false");

    await user.click(screen.getByRole("tab", { name: /sets/i }));
    expect(screen.getByTestId("active-tab")).toHaveTextContent("sets");
  });
});
