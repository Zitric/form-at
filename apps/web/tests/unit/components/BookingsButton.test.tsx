import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createJSONStorage } from "zustand/middleware";
import { BookingsButton } from "~/components/BookingsButton";
import { useStore } from "~/store";

function installInMemoryStorage() {
  const data = new Map<string, string>();
  const storage = createJSONStorage(() => ({
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      data.set(k, v);
    },
    removeItem: (k) => {
      data.delete(k);
    },
  }));
  useStore.persist.setOptions({ storage });
}

beforeEach(() => {
  installInMemoryStorage();
  useStore.setState({ toast: null });
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    writable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  useStore.setState({ toast: null });
});

describe("BookingsButton", () => {
  it("renders the bookings trigger", () => {
    render(<BookingsButton />);
    expect(screen.getByRole("button", { name: /bookings/i })).toBeInTheDocument();
  });

  it("opens a modal listing all four options on click", async () => {
    const user = userEvent.setup();
    render(<BookingsButton />);
    await user.click(screen.getByRole("button", { name: /bookings/i }));
    expect(screen.getByRole("button", { name: /copy_email/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /gmail/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /outlook/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /mail_app/ })).toBeInTheDocument();
  });

  it("triggers a toast when copy_email is clicked", async () => {
    const user = userEvent.setup();
    render(<BookingsButton />);
    await user.click(screen.getByRole("button", { name: /bookings/i }));
    await user.click(screen.getByRole("button", { name: /copy_email/ }));
    await waitFor(() => {
      expect(useStore.getState().toast).not.toBeNull();
    });
  });

  it("gmail link contains the bookings address as the `to` param", async () => {
    const user = userEvent.setup();
    render(<BookingsButton />);
    await user.click(screen.getByRole("button", { name: /bookings/i }));
    const gmailHref = screen.getByRole("link", { name: /gmail/ }).getAttribute("href") ?? "";
    expect(gmailHref).toContain("mail.google.com");
    expect(gmailHref).toContain("to=format.gla@gmail.com");
  });

  it("outlook link contains the bookings address as the `to` param", async () => {
    const user = userEvent.setup();
    render(<BookingsButton />);
    await user.click(screen.getByRole("button", { name: /bookings/i }));
    const outlookHref = screen.getByRole("link", { name: /outlook/ }).getAttribute("href") ?? "";
    expect(outlookHref).toContain("outlook.live.com");
    expect(outlookHref).toContain("to=format.gla@gmail.com");
  });

  it("mail_app link is a mailto URL with a prefilled subject", async () => {
    const user = userEvent.setup();
    render(<BookingsButton />);
    await user.click(screen.getByRole("button", { name: /bookings/i }));
    const mailHref = screen.getByRole("link", { name: /mail_app/ }).getAttribute("href") ?? "";
    expect(mailHref).toMatch(/^mailto:format\.gla@gmail\.com/);
    expect(mailHref).toContain("subject=");
  });
});
