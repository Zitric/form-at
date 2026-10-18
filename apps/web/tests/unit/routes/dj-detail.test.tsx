import type { DJ } from "@form-at/data/djs";
import type { Event } from "@form-at/data/events";
import { render, screen, within } from "@testing-library/react";
import type { ComponentType, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route } from "~/routes/djs/$djId";

// The DJ page splits the DJ's events by status: each upcoming one is a
// next_transmission row in the top block, linking to the event; only past
// ones are listed under deployment_history. Without the split an announced
// lineup lists a future night as history.

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    Link: ({
      to,
      params,
      children,
    }: { to: string; params?: Record<string, string>; children: ReactNode }) => (
      <a href={to.replace("$eventId", params?.eventId ?? "")}>{children}</a>
    ),
  };
});
vi.mock("~/data/setsForRoute", () => ({ fetchAllSetsForRoute: async () => [] }));
// PageLayout reads the router's location for its transition; no router here.
vi.mock("~/components/PageLayout", () => ({
  PageLayout: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));

const dj: DJ = { id: "test-dj", name: "Test DJ", type: "guest" };

function event(id: string, status: Event["status"], date: string): Event {
  return {
    id,
    title: `Form:at ${id}`,
    date,
    venue: "Stereo, Glasgow",
    city: "Glasgow",
    lineupIds: [dj.id],
    audio: "techno",
    runtime: "23:00 — 05:00",
    status,
  };
}

const upcoming = event("004", "upcoming", "2026-12-05");
const past = event("003", "past", "2026-08-28");

function renderWith(upcomingEvents: Event[], pastEvents: Event[]) {
  vi.spyOn(Route, "useLoaderData").mockReturnValue({ dj, upcomingEvents, pastEvents, sets: [] });
  const Page = Route.options.component as ComponentType;
  return render(<Page />);
}

describe("DJ page events", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows an upcoming event as a next_transmission row and a past one under deployment_history", () => {
    renderWith([upcoming], [past]);

    // Non-breaking space before each "·", so a wrap never starts a line with it.
    const link = screen.getByRole("link", {
      name: "Form:at 004 · Sat 05.12 · Stereo",
    });
    expect(link).toHaveAttribute("href", "/events/004");
    expect(link.closest("p")).toHaveTextContent("next_transmission:");

    const history = screen.getByText("deployment_history").closest("section");
    if (!history) throw new Error("no deployment_history section");
    expect(within(history).getByText(/Form:at 003/)).toBeInTheDocument();
    expect(within(history).queryByText(/Form:at 004/)).not.toBeInTheDocument();
  });

  it("has no deployment_history when every event is upcoming", () => {
    renderWith([upcoming], []);

    expect(screen.getByRole("link", { name: /Form:at 004/ })).toBeInTheDocument();
    expect(screen.queryByText("deployment_history")).not.toBeInTheDocument();
  });

  it("counts one event in the singular and more in the plural", () => {
    const { unmount } = renderWith([upcoming], []);
    expect(screen.getByText("events: 1 transmission", { exact: false })).toHaveTextContent(
      /events: 1 transmission$/,
    );
    unmount();

    renderWith([upcoming], [past]);
    expect(screen.getByText("events: 2 transmissions", { exact: false })).toBeInTheDocument();
  });

  it("has no next_transmission row when every event is past", () => {
    renderWith([], [past]);

    expect(screen.queryByText(/next_transmission/)).not.toBeInTheDocument();
    expect(screen.getByText("deployment_history")).toBeInTheDocument();
  });
});
