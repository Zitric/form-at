import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditSetForm } from "~/components/EditSetForm";
import type { SetWithPlayCount } from "~/data/sets-admin";

const sampleSet: SetWithPlayCount = {
  id: "set-002-til",
  title: "Form:at 002",
  artist: "t.i.l.",
  date: "2026-04-24",
  venue: "Find the red door, Glasgow",
  description: "Opening transmission.",
  duration: "45:18",
  src: "https://cdn.formatglasgow.com/002/audio.mp3",
  playCount: 342,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("EditSetForm", () => {
  it("pre-fills every field from the given set", () => {
    render(<EditSetForm set={sampleSet} onSaved={vi.fn()} onCancel={vi.fn()} />);

    expect(screen.getByLabelText(/^title$/i)).toHaveValue("Form:at 002");
    expect(screen.getByLabelText(/^artist$/i)).toHaveValue("t.i.l.");
    expect(screen.getByLabelText(/^date$/i)).toHaveValue("2026-04-24");
    expect(screen.getByLabelText(/venue/i)).toHaveValue("Find the red door, Glasgow");
    expect(screen.getByLabelText(/description/i)).toHaveValue("Opening transmission.");
    expect(screen.getByLabelText(/^duration$/i)).toHaveValue("45:18");
  });

  // The id is the R2 key path, the public URL, and the
  // analytics join key — this field must never be an editable input.
  it("shows the id but disables it — the field cannot be edited", () => {
    render(<EditSetForm set={sampleSet} onSaved={vi.fn()} onCancel={vi.fn()} />);

    const idField = screen.getByLabelText(/not editable/i);
    expect(idField).toHaveValue("set-002-til");
    expect(idField).toBeDisabled();
  });

  it("saves via PATCH with the edited fields and the unchanged id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<EditSetForm set={sampleSet} onSaved={onSaved} onCancel={vi.fn()} />);

    await user.clear(screen.getByLabelText(/^title$/i));
    await user.type(screen.getByLabelText(/^title$/i), "Form:at 002 (corrected)");
    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sets",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          id: "set-002-til",
          title: "Form:at 002 (corrected)",
          artist: "t.i.l.",
          date: "2026-04-24",
          venue: "Find the red door, Glasgow",
          description: "Opening transmission.",
          duration: "45:18",
        }),
      }),
    );
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });

  it("cancel calls onCancel without saving", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const onCancel = vi.fn();
    const user = userEvent.setup();
    render(<EditSetForm set={sampleSet} onSaved={vi.fn()} onCancel={onCancel} />);

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows a distinct message when the set was deleted by someone else (404)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }),
    );
    const user = userEvent.setup();
    render(<EditSetForm set={sampleSet} onSaved={vi.fn()} onCancel={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /^save$/i }));

    expect(await screen.findByText(/no longer exists/i)).toBeInTheDocument();
  });

  it("the save button stays disabled once title is cleared", async () => {
    const user = userEvent.setup();
    render(<EditSetForm set={sampleSet} onSaved={vi.fn()} onCancel={vi.fn()} />);

    await user.clear(screen.getByLabelText(/^title$/i));

    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled();
  });
});
