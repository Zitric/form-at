import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SetsList } from "~/components/SetsList";
import type { RecentDeletedSet, SetWithPlayCount } from "~/data/sets-admin";

const zeroPlaySet: SetWithPlayCount = {
  id: "set-003-new-artist",
  title: "Form:at 003",
  artist: "New Artist",
  date: "2026-09-01",
  src: "https://cdn.formatglasgow.com/sets/set-003-new-artist/audio.mp3",
  playCount: 0,
};

const heavilyPlayedSet: SetWithPlayCount = {
  id: "set-002-til",
  title: "Form:at 002",
  artist: "t.i.l.",
  date: "2026-04-24",
  src: "https://cdn.formatglasgow.com/002/audio.mp3",
  playCount: 342,
};

const recentDeletions: RecentDeletedSet[] = [
  {
    logId: 7,
    deletedAt: 1_722_000_000_000,
    deletedByEmail: "julian@formatglasgow.com",
    setId: "set-999-old",
    title: "Form:at 999",
    artist: "Old Artist",
    playCountAtDeletion: 12,
  },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("SetsList", () => {
  it("renders every set with its play count and the recently-deleted list", () => {
    render(
      <SetsList
        sets={[zeroPlaySet, heavilyPlayedSet]}
        recentDeletions={recentDeletions}
        onChanged={vi.fn()}
      />,
    );

    expect(screen.getByText(/New Artist @ Form:at 003/)).toBeInTheDocument();
    expect(screen.getByText(/t.i.l. @ Form:at 002/)).toBeInTheDocument();
    expect(screen.getByText(/Form:at 999.*Old Artist/)).toBeInTheDocument();
  });

  it("clicking edit replaces that row with a pre-filled EditSetForm", async () => {
    const user = userEvent.setup();
    render(<SetsList sets={[zeroPlaySet]} recentDeletions={[]} onChanged={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /edit/i }));

    expect(screen.getByLabelText(/^title$/i)).toHaveValue("Form:at 003");
  });

  // PR6 review item 1a — the core safeguard: a zero-play set is a single
  // confirm click; a played set requires typing the id first.
  describe("delete confirmation, play-count-gated", () => {
    it("a zero-play set's confirm button is enabled immediately, no type-to-confirm field", async () => {
      const user = userEvent.setup();
      render(<SetsList sets={[zeroPlaySet]} recentDeletions={[]} onChanged={vi.fn()} />);

      await user.click(screen.getByRole("button", { name: /delete/i }));

      expect(screen.queryByLabelText(/type .* to confirm/i)).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /confirm delete/i })).toBeEnabled();
    });

    it("a played set's confirm button starts disabled and only enables once the id is typed exactly", async () => {
      const user = userEvent.setup();
      render(<SetsList sets={[heavilyPlayedSet]} recentDeletions={[]} onChanged={vi.fn()} />);

      await user.click(screen.getByRole("button", { name: /delete/i }));

      expect(screen.getAllByText(/342/).length).toBeGreaterThan(0);
      const confirmButton = screen.getByRole("button", { name: /confirm delete/i });
      expect(confirmButton).toBeDisabled();

      const confirmField = screen.getByLabelText(/type .* to confirm/i);
      await user.type(confirmField, "wrong-id");
      expect(confirmButton).toBeDisabled();

      await user.clear(confirmField);
      await user.type(confirmField, "set-002-til");
      expect(confirmButton).toBeEnabled();
    });

    it("the consequence chain (offline purge timing, snapshot lag, R2 policy) is stated plainly", async () => {
      const user = userEvent.setup();
      render(<SetsList sets={[zeroPlaySet]} recentDeletions={[]} onChanged={vi.fn()} />);

      await user.click(screen.getByRole("button", { name: /delete/i }));

      expect(
        screen.getByText(/won't disappear from the public site until the next deploy/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/keep it until their device's next successful online visit/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/not deleted from storage/i)).toBeInTheDocument();
    });

    it("confirming fires DELETE with the set id, disables buttons while in flight, and calls onChanged on success", async () => {
      let resolveFetch!: (value: unknown) => void;
      const fetchMock = vi.fn(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const onChanged = vi.fn();
      const user = userEvent.setup();
      render(<SetsList sets={[zeroPlaySet]} recentDeletions={[]} onChanged={onChanged} />);

      await user.click(screen.getByRole("button", { name: /delete/i }));
      await user.click(screen.getByRole("button", { name: /confirm delete/i }));

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/sets",
        expect.objectContaining({
          method: "DELETE",
          body: JSON.stringify({ id: "set-003-new-artist" }),
        }),
      );
      expect(screen.getByText(/deleting/i)).toBeInTheDocument();

      resolveFetch({ ok: true, status: 200 });
      await vi.waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    });

    it("cancel closes the modal without firing a request", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();
      render(<SetsList sets={[zeroPlaySet]} recentDeletions={[]} onChanged={vi.fn()} />);

      await user.click(screen.getByRole("button", { name: /delete/i }));
      await user.click(screen.getByRole("button", { name: /cancel/i }));

      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: /confirm delete/i })).not.toBeInTheDocument();
    });

    it("shows an error and does not call onChanged when delete fails", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
      const onChanged = vi.fn();
      const user = userEvent.setup();
      render(<SetsList sets={[zeroPlaySet]} recentDeletions={[]} onChanged={onChanged} />);

      await user.click(screen.getByRole("button", { name: /delete/i }));
      await user.click(screen.getByRole("button", { name: /confirm delete/i }));

      expect(await screen.findByText(/delete failed/i)).toBeInTheDocument();
      expect(onChanged).not.toHaveBeenCalled();
    });
  });

  // One-click restore feature (2026-08) — restore-from-log, single-click
  // confirm (not typed-confirmation-gated like delete; see SetsList.tsx's
  // RestoreConfirmModal comment for why). These lock: the modal states the
  // immediate-republish consequence plainly, confirming fires the right
  // request, and each distinct failure mode (404/422/409/401/network) shows
  // its own message rather than a generic one.
  describe("restore confirmation", () => {
    it("clicking restore opens a confirm modal stating the immediate-republish consequence and the offline-download caveat", async () => {
      const user = userEvent.setup();
      render(<SetsList sets={[]} recentDeletions={recentDeletions} onChanged={vi.fn()} />);

      await user.click(screen.getByRole("button", { name: /restore/i }));

      expect(screen.getByText(/live on the public site again, immediately/i)).toBeInTheDocument();
      expect(
        screen.getByText(/does not bring those back — they'd need to save it again/i),
      ).toBeInTheDocument();
    });

    it("confirming fires POST with the log entry's id, disables while in flight, and calls onChanged on success", async () => {
      let resolveFetch!: (value: unknown) => void;
      const fetchMock = vi.fn(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const onChanged = vi.fn();
      const user = userEvent.setup();
      render(<SetsList sets={[]} recentDeletions={recentDeletions} onChanged={onChanged} />);

      await user.click(screen.getByRole("button", { name: /restore/i }));
      await user.click(screen.getByRole("button", { name: /confirm restore/i }));

      expect(fetchMock).toHaveBeenCalledWith(
        "/api/sets/restore",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ id: 7 }),
        }),
      );
      expect(screen.getByText(/restoring/i)).toBeInTheDocument();

      resolveFetch({ ok: true, status: 200 });
      await vi.waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
    });

    it("cancel closes the modal without firing a request", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const user = userEvent.setup();
      render(<SetsList sets={[]} recentDeletions={recentDeletions} onChanged={vi.fn()} />);

      await user.click(screen.getByRole("button", { name: /restore/i }));
      await user.click(screen.getByRole("button", { name: /cancel/i }));

      expect(fetchMock).not.toHaveBeenCalled();
      expect(screen.queryByRole("button", { name: /confirm restore/i })).not.toBeInTheDocument();
    });

    it("shows the response body's specific message on 404/422/409, not a generic failure", async () => {
      const cases: Array<{ status: number; message: string }> = [
        { status: 404, message: "This deletion record no longer exists or was already restored." },
        {
          status: 422,
          message: "The original audio/artwork/peaks files are no longer in storage.",
        },
        { status: 409, message: "A set with this id already exists." },
      ];

      for (const { status, message } of cases) {
        vi.stubGlobal(
          "fetch",
          vi.fn().mockResolvedValue({
            ok: false,
            status,
            json: async () => ({ message }),
          }),
        );
        const user = userEvent.setup();
        const { unmount } = render(
          <SetsList sets={[]} recentDeletions={recentDeletions} onChanged={vi.fn()} />,
        );

        await user.click(screen.getByRole("button", { name: /restore/i }));
        await user.click(screen.getByRole("button", { name: /confirm restore/i }));

        expect(await screen.findByText(message)).toBeInTheDocument();
        unmount();
      }
    });

    it("shows 'not authorized' on 401 without reading a body", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
      const user = userEvent.setup();
      render(<SetsList sets={[]} recentDeletions={recentDeletions} onChanged={vi.fn()} />);

      await user.click(screen.getByRole("button", { name: /restore/i }));
      await user.click(screen.getByRole("button", { name: /confirm restore/i }));

      expect(await screen.findByText(/not authorized/i)).toBeInTheDocument();
    });
  });
});
