import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UploadSetForm } from "~/components/UploadSetForm";

// Set-upload feature (PR4). File validity (peaks/artwork/audio decode) is
// covered directly in validateUpload.test.ts — mocked here so this test
// stays focused on the submit SEQUENCE: presign → 3 PUTs (in order) →
// create. `fetch()` has no upload-progress API, so the 3 PUTs go through
// `XMLHttpRequest` (uploadWithProgress.ts) — this repo had no XHR mock
// harness before this PR; the small fake class below is that harness.
vi.mock("~/utils/validateUpload", () => ({
  validatePeaksFile: vi.fn().mockResolvedValue(true),
  validateArtworkFile: vi.fn().mockResolvedValue(true),
  readAudioDuration: vi.fn().mockResolvedValue(2718),
}));

class FakeXHR {
  static instances: FakeXHR[] = [];
  method = "";
  url = "";
  upload: {
    onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null;
  } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  status = 200;

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  send() {
    FakeXHR.instances.push(this);
    queueMicrotask(() => {
      this.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 1 });
      this.onload?.();
    });
  }
}

async function fillAndSelectFiles() {
  const user = userEvent.setup();
  render(<UploadSetForm onCreated={vi.fn()} />);

  await user.type(screen.getByLabelText("title"), "Form:at 003");
  await user.type(screen.getByLabelText("artist"), "New Artist");
  fireEvent.change(screen.getByLabelText("date"), { target: { value: "2026-09-01" } });

  await user.upload(
    screen.getByLabelText(/audio \(mp3\)/i),
    new File(["a"], "set.mp3", { type: "audio/mpeg" }),
  );
  await user.upload(
    screen.getByLabelText(/artwork \(jpg\/png\)/i),
    new File(["b"], "artwork.jpg", { type: "image/jpeg" }),
  );
  await user.upload(
    screen.getByLabelText(/peaks \(json\)/i),
    new File(["c"], "peaks.json", { type: "application/json" }),
  );

  await waitFor(() => expect(screen.getByText("upload")).not.toBeDisabled());
  return user;
}

describe("UploadSetForm — submit sequence", () => {
  beforeEach(() => {
    FakeXHR.instances = [];
    vi.stubGlobal("XMLHttpRequest", FakeXHR);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("presigns, PUTs audio/artwork/peaks in that order, then creates — success screen shows the id", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/sets-presign") {
        return new Response(
          JSON.stringify({
            audioUploadUrl: "https://r2.example.com/audio",
            artworkUploadUrl: "https://r2.example.com/artwork",
            peaksUploadUrl: "https://r2.example.com/peaks",
          }),
          { status: 200 },
        );
      }
      if (url === "/api/sets") {
        return new Response(JSON.stringify({ id: "set-003-new-artist" }), { status: 201 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = await fillAndSelectFiles();

    await user.click(screen.getByText("upload"));
    await user.click(screen.getByRole("button", { name: "confirm upload" }));

    await waitFor(() => expect(screen.getByText(/upload_complete/)).toBeInTheDocument());

    expect(FakeXHR.instances.map((x) => x.url)).toEqual([
      "https://r2.example.com/audio",
      "https://r2.example.com/artwork",
      "https://r2.example.com/peaks",
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sets-presign",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/sets",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("shows an id-conflict error and does NOT attempt any PUT when presign returns 409", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);

    const user = await fillAndSelectFiles();
    await user.click(screen.getByText("upload"));
    await user.click(screen.getByRole("button", { name: "confirm upload" }));

    await waitFor(() => expect(screen.getByText(/already taken/i)).toBeInTheDocument());
    expect(FakeXHR.instances).toHaveLength(0);
  });

  // The server-side R2-existence check (review item) surfaces as a 422 from
  // /api/sets — locks that the form shows a message distinct from the
  // generic "saving the set failed" one, so an admin isn't left guessing
  // whether to re-upload or just retry the save.
  it("shows a files-not-found error when create returns 422 after all 3 PUTs succeeded", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/sets-presign") {
        return new Response(
          JSON.stringify({
            audioUploadUrl: "https://r2.example.com/audio",
            artworkUploadUrl: "https://r2.example.com/artwork",
            peaksUploadUrl: "https://r2.example.com/peaks",
          }),
          { status: 200 },
        );
      }
      if (url === "/api/sets") {
        return new Response(null, { status: 422 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = await fillAndSelectFiles();
    await user.click(screen.getByText("upload"));
    await user.click(screen.getByRole("button", { name: "confirm upload" }));

    await waitFor(() => expect(screen.getByText(/couldn't be found on R2/i)).toBeInTheDocument());
    expect(FakeXHR.instances).toHaveLength(3);
  });
});
