import type { DJ } from "@form-at/data/djs";
import type { Event } from "@form-at/data/events";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentType, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Route } from "~/routes/djs/$djId";
import { useStore } from "~/store";

// The DJ page splits the DJ's events by status: each upcoming one is a
// "next" row in the top block, linking to the event; only past ones are
// listed under deployment_history. Without the split an announced lineup
// lists a future night as history.

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
    venue: "Stereo, Renfield Lane, City Centre, Glasgow",
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

// jsdom applies no media queries (and loads no Tailwind), so both lengths are
// in its DOM at once: assert each one's text and the classes that hide it.
function nextLink(container: HTMLElement): HTMLAnchorElement {
  const link = container.querySelector<HTMLAnchorElement>('a[href="/events/004"]');
  if (!link) throw new Error("no link to /events/004");
  return link;
}

describe("DJ page events", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows an upcoming event as a 'next' row linking to it, and a past one under deployment_history", () => {
    const { container } = renderWith([upcoming], [past]);

    const link = nextLink(container);
    expect(link.closest("p")).toHaveTextContent(/^›\s*next:/);
    expect(screen.queryByText(/next_transmission/)).not.toBeInTheDocument();

    const history = screen.getByText("deployment_history").closest("section");
    if (!history) throw new Error("no deployment_history section");
    expect(within(history).getByText(/Form:at 003/)).toBeInTheDocument();
    expect(within(history).queryByText(/Form:at 004/)).not.toBeInTheDocument();
  });

  it("renders a short label below 400px and a long one from 400px, CSS only", () => {
    const { container } = renderWith([upcoming], []);

    const [short, long] = Array.from(nextLink(container).children);
    // Short: shown by default, display:none from 400px.
    expect(short).toHaveClass("min-[400px]:hidden");
    expect(short).not.toHaveClass("hidden");
    expect(short).toHaveTextContent(/^\[\s*004 · sat\s05\.12\s*\]$/);
    // Long: display:none by default, shown from 400px.
    expect(long).toHaveClass("hidden", "min-[400px]:inline");
    expect(long).toHaveTextContent(/^\[\s*form:at 004 · sat\s05\.12 · stereo\s*\]$/);
  });

  it("has no deployment_history when every event is upcoming", () => {
    const { container } = renderWith([upcoming], []);

    expect(nextLink(container)).toBeInTheDocument();
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

  it("has no next row when every event is past", () => {
    const { container } = renderWith([], [past]);

    expect(container.querySelector('a[href^="/events/"]')).toBeNull();
    expect(screen.queryByText(/^›\s*next:/)).not.toBeInTheDocument();
    expect(screen.getByText("deployment_history")).toBeInTheDocument();
  });
});

describe("DJ page actions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("puts [ share ] beside the name, to its right, and no story button on the page", () => {
    renderWith([upcoming], []);

    const share = screen.getByRole("button", { name: "[ share ]" });
    const name = screen.getByRole("heading", { level: 1 });
    expect(name.contains(share)).toBe(false);
    // One row: the name, then the button, aligned on the name's first line.
    const row = name.parentElement;
    expect(row).toContainElement(share);
    expect(row).toHaveClass("flex", "items-baseline", "justify-between");
    expect(name.compareDocumentPosition(share) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // The name may wrap; the button never shrinks out of the row.
    expect(name).toHaveClass("min-w-0");
    expect(share.parentElement).toHaveClass("shrink-0");
    // The Story image is in the share modal's instagram: section instead.
    expect(screen.queryByRole("button", { name: /_story/ })).not.toBeInTheDocument();
  });

  it("shares the DJ with their next night, for the Story image's event line", async () => {
    renderWith([upcoming], []);

    await userEvent.click(screen.getByRole("button", { name: "[ share ]" }));

    const target = useStore.getState().shareTarget;
    expect(target?.kind).toBe("dj");
    expect(target?.kind === "dj" && target.nextEvent?.id).toBe("004");
    useStore.setState({ shareTarget: null });
  });
});
