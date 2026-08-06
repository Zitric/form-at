import { Button, Label, Modal } from "@form-at/ui";
import { type ChangeEvent, useEffect, useState } from "react";
import { fmtBytes, fmtSetDuration } from "~/utils/fmt";
import { isValidSetId } from "~/utils/r2Sets";
import { slugifySetId } from "~/utils/slugifySetId";
import { uploadWithProgress } from "~/utils/uploadWithProgress";
import { readAudioDuration, validateArtworkFile, validatePeaksFile } from "~/utils/validateUpload";

interface UploadSetFormProps {
  onCreated: () => void;
}

type FileKey = "audio" | "artwork" | "peaks";
type Progress = Record<FileKey, number>;

const inputClass =
  "w-full bg-black border border-grey/30 px-2 py-1 text-white font-mono text-sm focus:border-gold outline-none";

function getExt(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

const ZERO_PROGRESS: Progress = { audio: 0, artwork: 0, peaks: 0 };

// Mirrors SendPushForm.tsx's double-submit protection exactly, deliberately
// rather than inventing a different interaction for this form: a
// hard confirm-modal second step, a `uploading` boolean that disables (and
// once true, entirely replaces) the confirm/cancel buttons, and error/result
// state that persists rather than being silently discarded. The one
// addition: per-file + overall upload progress (weighted by byte size),
// necessary here in a way it wasn't for a text-only push notification —
// `fetch()` has no upload-progress API, so this is all XMLHttpRequest
// underneath (see uploadWithProgress.ts).
export function UploadSetForm({ onCreated }: UploadSetFormProps) {
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [date, setDate] = useState("");
  const [venue, setVenue] = useState("");
  const [description, setDescription] = useState("");

  const [id, setId] = useState("");
  const [idTouched, setIdTouched] = useState(false);

  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [artworkFile, setArtworkFile] = useState<File | null>(null);
  const [peaksFile, setPeaksFile] = useState<File | null>(null);

  const [duration, setDuration] = useState("");
  const [durationTouched, setDurationTouched] = useState(false);

  const [audioError, setAudioError] = useState<string | null>(null);
  const [artworkError, setArtworkError] = useState<string | null>(null);
  const [peaksError, setPeaksError] = useState<string | null>(null);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<Progress>(ZERO_PROGRESS);
  const [currentFile, setCurrentFile] = useState<FileKey | null>(null);
  const [result, setResult] = useState<{ id: string; artist: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-slugged default matching the real `set-{eventSeq}-{artistSlug}`
  // convention — stops recomputing the instant the admin types into the id
  // field directly, since it stays editable regardless.
  useEffect(() => {
    if (!idTouched && title.trim() && artist.trim()) {
      setId(slugifySetId(title, artist));
    }
  }, [title, artist, idTouched]);

  // Orphan-R2-object mitigation: most orphans come from an admin thinking the
  // tab hung and closing it mid-upload, not from a genuine create failure — so
  // warn before that can happen.
  useEffect(() => {
    if (!uploading) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [uploading]);

  const handleAudioChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setAudioFile(file);
    setAudioError(null);
    if (!file) return;
    try {
      // Cheap — <audio preload="metadata"> reads only the header, not a
      // full decode. Doubles as this file's validity check: an unplayable
      // file never fires `loadedmetadata`.
      const seconds = await readAudioDuration(file);
      if (!durationTouched) setDuration(fmtSetDuration(seconds));
    } catch {
      setAudioError("could not read this as audio — is it a valid mp3?");
    }
  };

  const handleArtworkChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setArtworkFile(file);
    setArtworkError(null);
    if (!file) return;
    const ok = await validateArtworkFile(file);
    if (!ok) setArtworkError("could not decode this as an image");
  };

  const handlePeaksChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setPeaksFile(file);
    setPeaksError(null);
    if (!file) return;
    const ok = await validatePeaksFile(file);
    if (!ok)
      setPeaksError("doesn't look like a valid peaks.json (expected { peaks: [1000 numbers] })");
  };

  const canSubmit =
    title.trim().length > 0 &&
    artist.trim().length > 0 &&
    date.trim().length > 0 &&
    isValidSetId(id) &&
    !!audioFile &&
    !audioError &&
    !!artworkFile &&
    !artworkError &&
    !!peaksFile &&
    !peaksError;

  const handleOpenConfirm = () => {
    setResult(null);
    setError(null);
    setConfirmOpen(true);
  };

  const resetForm = () => {
    setTitle("");
    setArtist("");
    setDate("");
    setVenue("");
    setDescription("");
    setId("");
    setIdTouched(false);
    setAudioFile(null);
    setArtworkFile(null);
    setPeaksFile(null);
    setDuration("");
    setDurationTouched(false);
    setAudioError(null);
    setArtworkError(null);
    setPeaksError(null);
    setResult(null);
    setError(null);
  };

  const handleConfirmUpload = async () => {
    if (!audioFile || !artworkFile || !peaksFile) return;
    setUploading(true);
    setError(null);
    setProgress(ZERO_PROGRESS);

    try {
      const audioExt = getExt(audioFile.name);
      const artworkExt = getExt(artworkFile.name);

      const presignResponse = await fetch("/api/sets-presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, audioExt, artworkExt }),
      });
      if (!presignResponse.ok) {
        setError(
          presignResponse.status === 409
            ? "this id is already taken — edit it and try again"
            : presignResponse.status === 401
              ? "not authorized"
              : "could not start the upload",
        );
        return;
      }
      const presign = (await presignResponse.json()) as {
        audioUploadUrl: string;
        artworkUploadUrl: string;
        peaksUploadUrl: string;
      };

      setCurrentFile("audio");
      await uploadWithProgress(presign.audioUploadUrl, await audioFile.arrayBuffer(), (loaded) => {
        setProgress((p) => ({ ...p, audio: loaded }));
      });

      setCurrentFile("artwork");
      await uploadWithProgress(
        presign.artworkUploadUrl,
        await artworkFile.arrayBuffer(),
        (loaded) => {
          setProgress((p) => ({ ...p, artwork: loaded }));
        },
      );

      setCurrentFile("peaks");
      await uploadWithProgress(presign.peaksUploadUrl, await peaksFile.arrayBuffer(), (loaded) => {
        setProgress((p) => ({ ...p, peaks: loaded }));
      });

      const createResponse = await fetch("/api/sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          title: title.trim(),
          artist: artist.trim(),
          date,
          venue: venue.trim() || undefined,
          description: description.trim() || undefined,
          duration: duration.trim() || undefined,
          sizeBytes: audioFile.size,
          audioExt,
          artworkExt,
        }),
      });
      if (!createResponse.ok) {
        setError(
          createResponse.status === 409
            ? "this id is already taken — edit it and try again"
            : createResponse.status === 422
              ? "the uploaded files couldn't be found on R2 — try uploading again"
              : "upload finished but saving the set failed — try again",
        );
        return;
      }

      setResult({ id, artist: artist.trim() });
      setConfirmOpen(false);
      onCreated();
    } catch {
      setError("upload failed — check your connection and try again");
    } finally {
      setUploading(false);
      setCurrentFile(null);
    }
  };

  const totalBytes = (audioFile?.size ?? 0) + (artworkFile?.size ?? 0) + (peaksFile?.size ?? 0);
  const loadedBytes = progress.audio + progress.artwork + progress.peaks;
  const overallPercent = totalBytes > 0 ? Math.floor((loadedBytes / totalBytes) * 100) : 0;

  if (result) {
    return (
      <div className="space-y-4 border border-grey/30 p-4">
        <Label className="text-grey tracking-widest">{"// upload_complete"}</Label>
        <p className="t-body text-white">
          '<span className="text-gold">{result.id}</span>' created.
        </p>
        {/* Stated plainly here, not just in docs — the admin has no other way
            to know these three things. */}
        <ul className="space-y-2 text-sm text-grey list-disc list-inside">
          <li>
            live now — visible on the next full load of <code>/sets</code> (a tab already open on
            that page needs a reload to see it).
          </li>
          <li>
            artwork renders as the plain original for now, not a responsive variant — that lands in
            a follow-up PR. The social share banner needs the next deploy to appear.
          </li>
          <li>
            won't show up on {result.artist}'s DJ page until '{result.id}' is added to their{" "}
            <code>setIds</code> in <code>apps/web/app/data/djs.ts</code> and deployed.
          </li>
        </ul>
        <Button variant="secondary" onClick={resetForm}>
          upload another
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="border border-grey/30 p-4 space-y-3">
        <Label className="text-grey tracking-widest">{"// upload_set"}</Label>
        <div>
          <label htmlFor="set-title" className="block text-xs text-grey mb-1">
            title
          </label>
          <input
            id="set-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="set-artist" className="block text-xs text-grey mb-1">
            artist
          </label>
          <input
            id="set-artist"
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="set-date" className="block text-xs text-grey mb-1">
            date
          </label>
          <input
            id="set-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="set-venue" className="block text-xs text-grey mb-1">
            venue (optional)
          </label>
          <input
            id="set-venue"
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="set-description" className="block text-xs text-grey mb-1">
            description (optional)
          </label>
          <textarea
            id="set-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="set-id" className="block text-xs text-grey mb-1">
            id
          </label>
          <input
            id="set-id"
            value={id}
            onChange={(e) => {
              setIdTouched(true);
              setId(e.target.value);
            }}
            className={inputClass}
          />
          {id.length > 0 && !isValidSetId(id) && (
            <p className="text-xs text-red-400 mt-1">
              lowercase letters, numbers, and single hyphens only
            </p>
          )}
        </div>
        <div>
          <label htmlFor="set-duration" className="block text-xs text-grey mb-1">
            duration
          </label>
          <input
            id="set-duration"
            value={duration}
            onChange={(e) => {
              setDurationTouched(true);
              setDuration(e.target.value);
            }}
            placeholder="auto-filled from the audio file"
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor="set-audio" className="block text-xs text-grey mb-1">
            audio (mp3){audioFile && ` · ${fmtBytes(audioFile.size)}`}
          </label>
          <input
            id="set-audio"
            type="file"
            accept="audio/mpeg,.mp3"
            onChange={handleAudioChange}
            className={inputClass}
          />
          {audioError && <p className="text-xs text-red-400 mt-1">{audioError}</p>}
        </div>
        <div>
          <label htmlFor="set-artwork" className="block text-xs text-grey mb-1">
            artwork (jpg/png){artworkFile && ` · ${fmtBytes(artworkFile.size)}`}
          </label>
          <input
            id="set-artwork"
            type="file"
            accept="image/jpeg,image/png,.jpg,.jpeg,.png"
            onChange={handleArtworkChange}
            className={inputClass}
          />
          {artworkError && <p className="text-xs text-red-400 mt-1">{artworkError}</p>}
        </div>
        <div>
          <label htmlFor="set-peaks" className="block text-xs text-grey mb-1">
            peaks (json){peaksFile && ` · ${fmtBytes(peaksFile.size)}`}
          </label>
          <input
            id="set-peaks"
            type="file"
            accept="application/json,.json"
            onChange={handlePeaksChange}
            className={inputClass}
          />
          {peaksError && <p className="text-xs text-red-400 mt-1">{peaksError}</p>}
        </div>
      </div>

      <Button
        variant="primary"
        onClick={handleOpenConfirm}
        disabled={!canSubmit}
        className={!canSubmit ? "opacity-40 cursor-not-allowed" : undefined}
      >
        upload
      </Button>

      <Modal
        open={confirmOpen}
        onClose={() => {
          if (!uploading) setConfirmOpen(false);
        }}
        title={<Label className="text-grey">confirm upload</Label>}
        ariaLabel="Confirm set upload"
      >
        <div className="space-y-3">
          {uploading ? (
            <div className="space-y-2">
              <p className="text-sm text-grey">
                uploading {currentFile} · {overallPercent}% overall
              </p>
              <div className="h-2 bg-grey/20">
                <div
                  className="h-2 bg-gold transition-[width]"
                  style={{ width: `${overallPercent}%` }}
                />
              </div>
            </div>
          ) : (
            <>
              <p className="t-body sm:t-body-md text-grey">
                Upload <span className="text-white">{title}</span> by{" "}
                <span className="text-white">{artist}</span> as{" "}
                <span className="text-white">'{id}'</span>?
              </p>
              <p className="text-xs text-grey/70">
                {audioFile && fmtBytes(audioFile.size)} audio +{" "}
                {artworkFile && fmtBytes(artworkFile.size)} artwork +{" "}
                {peaksFile && fmtBytes(peaksFile.size)} peaks
              </p>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <div className="flex gap-4">
                <Button variant="primary" onClick={handleConfirmUpload}>
                  confirm upload
                </Button>
                <Button variant="secondary" onClick={() => setConfirmOpen(false)}>
                  cancel
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
