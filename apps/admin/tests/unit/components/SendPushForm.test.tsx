import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SendPushForm } from "~/components/SendPushForm";

afterEach(() => {
  vi.unstubAllGlobals();
});

async function fillForm(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/^title$/i), "New set dropped");
  await user.type(screen.getByLabelText(/^body$/i), "Check it out");
}

describe("SendPushForm", () => {
  it("does not fire a request until the confirm step is completed", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<SendPushForm subscriberCount={5} onSent={vi.fn()} />);

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: /^send$/i }));

    // The confirm modal is open, but no request has fired yet.
    expect(screen.getByRole("button", { name: /confirm send/i })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("echoes the subscriber count and preview content in the confirm modal", async () => {
    const user = userEvent.setup();
    render(<SendPushForm subscriberCount={7} onSent={vi.fn()} />);

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: /^send$/i }));

    expect(screen.getByText(/7/)).toBeInTheDocument();
    expect(screen.getByText(/devices/i)).toBeInTheDocument();
  });

  it("cancel closes the modal without firing a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<SendPushForm subscriberCount={5} onSent={vi.fn()} />);

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: /^send$/i }));
    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the real payload only after confirm, and disables the button during the request (no double-send)", async () => {
    let resolveFetch!: (value: unknown) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<SendPushForm subscriberCount={5} onSent={vi.fn()} />);

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: /^send$/i }));
    const confirmButton = screen.getByRole("button", { name: /confirm send/i });
    await user.click(confirmButton);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/send-push",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          title: "New set dropped",
          body: "Check it out",
          url: undefined,
          image: undefined,
        }),
      }),
    );

    // Busy: the button is disabled, a second click can't fire a second request.
    expect(screen.getByRole("button", { name: /sending/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /sending/i }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveFetch({
      ok: true,
      status: 200,
      json: async () => ({ total: 5, sent: 4, failed: 1, deadRemoved: 0 }),
    });

    expect(
      await screen.findByText(/sent 4 \/ failed 1 \/ removed 0 \(of 5 subscribers\)/i),
    ).toBeInTheDocument();
  });

  it("shows an error state instead of a result when the request is rejected (401)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }),
    );
    const user = userEvent.setup();
    render(<SendPushForm subscriberCount={5} onSent={vi.fn()} />);

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: /^send$/i }));
    await user.click(screen.getByRole("button", { name: /confirm send/i }));

    expect(await screen.findByText(/not authorized/i)).toBeInTheDocument();
  });

  it("calls onSent after a successful send", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ total: 5, sent: 5, failed: 0, deadRemoved: 0 }),
      }),
    );
    const onSent = vi.fn();
    const user = userEvent.setup();
    render(<SendPushForm subscriberCount={5} onSent={onSent} />);

    await fillForm(user);
    await user.click(screen.getByRole("button", { name: /^send$/i }));
    await user.click(screen.getByRole("button", { name: /confirm send/i }));

    await screen.findByText(/sent 5/i);
    expect(onSent).toHaveBeenCalledTimes(1);
  });

  it("the send button stays disabled until both title and body are filled", async () => {
    const user = userEvent.setup();
    render(<SendPushForm subscriberCount={5} onSent={vi.fn()} />);

    expect(screen.getByRole("button", { name: /^send$/i })).toBeDisabled();
    await user.type(screen.getByLabelText(/^title$/i), "t");
    expect(screen.getByRole("button", { name: /^send$/i })).toBeDisabled();
    await user.type(screen.getByLabelText(/^body$/i), "b");
    expect(screen.getByRole("button", { name: /^send$/i })).toBeEnabled();
  });
});
