import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RecentPushSends } from "~/components/RecentPushSends";

describe("RecentPushSends", () => {
  it("shows a no-sends message when the list is empty", () => {
    render(<RecentPushSends sends={[]} />);
    expect(screen.getByText(/no sends yet/i)).toBeInTheDocument();
  });

  it("renders each send with who, what, and the outcome counts", () => {
    render(
      <RecentPushSends
        sends={[
          {
            sentAt: 1_722_000_000_000,
            sentByEmail: "julian@example.com",
            title: "New set dropped",
            sentCount: 5,
            failedCount: 1,
            deadRemovedCount: 0,
          },
        ]}
      />,
    );
    expect(screen.getByText(/julian@example\.com/)).toBeInTheDocument();
    expect(screen.getByText(/New set dropped/)).toBeInTheDocument();
    expect(screen.getByText(/5 sent \/ 1 failed \/ 0 removed/)).toBeInTheDocument();
  });
});
