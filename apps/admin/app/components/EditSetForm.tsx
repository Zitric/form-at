import { Button } from "@form-at/ui";
import { useState } from "react";
import type { SetWithPlayCount } from "~/data/sets-admin";

interface EditSetFormProps {
  set: SetWithPlayCount;
  onSaved: () => void;
  onCancel: () => void;
}

const inputClass =
  "w-full bg-black border border-grey/30 px-2 py-1 text-white font-mono text-sm focus:border-gold outline-none";

// Metadata-only (PR6 review — scope decision): title/artist/date/venue/
// description/duration. No file replacement — see PWA_PROGRESS.md's PR6
// entry for why that's deferred (a same-id file swap is invisible to
// reconcileFromIdb's catalogue-membership check, a real cache-invalidation
// problem, not just more UI work).
//
// The id field is shown but disabled, not omitted — the admin should see
// which set they're editing without any way to touch the one field that's
// the R2 key path, the public URL, and the analytics join key across
// plays/events (PR6 review item 5). The real enforcement is server-side
// (routes/api/sets.ts's updateSet never includes `id` in its `SET` clause,
// regardless of what a request body contains) — this disabled field is
// just honest UI, not the actual guarantee.
export function EditSetForm({ set, onSaved, onCancel }: EditSetFormProps) {
  const [title, setTitle] = useState(set.title);
  const [artist, setArtist] = useState(set.artist);
  const [date, setDate] = useState(set.date);
  const [venue, setVenue] = useState(set.venue ?? "");
  const [description, setDescription] = useState(set.description ?? "");
  const [duration, setDuration] = useState(set.duration ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = title.trim().length > 0 && artist.trim().length > 0 && date.trim().length > 0;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/sets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: set.id,
          title: title.trim(),
          artist: artist.trim(),
          date,
          venue: venue.trim() || undefined,
          description: description.trim() || undefined,
          duration: duration.trim() || undefined,
        }),
      });
      if (!response.ok) {
        setError(
          response.status === 404
            ? "this set no longer exists — someone else may have deleted it"
            : response.status === 401
              ? "not authorized"
              : "save failed — try again",
        );
        return;
      }
      onSaved();
    } catch {
      setError("save failed — check your connection and try again");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-gold/40 p-4 space-y-3">
      <div>
        <label htmlFor={`edit-id-${set.id}`} className="block text-xs text-grey mb-1">
          id (not editable — it's the R2 key path, the public URL, and the analytics join key)
        </label>
        <input
          id={`edit-id-${set.id}`}
          value={set.id}
          disabled
          className={`${inputClass} opacity-50 cursor-not-allowed`}
        />
      </div>
      <div>
        <label htmlFor={`edit-title-${set.id}`} className="block text-xs text-grey mb-1">
          title
        </label>
        <input
          id={`edit-title-${set.id}`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor={`edit-artist-${set.id}`} className="block text-xs text-grey mb-1">
          artist
        </label>
        <input
          id={`edit-artist-${set.id}`}
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor={`edit-date-${set.id}`} className="block text-xs text-grey mb-1">
          date
        </label>
        <input
          id={`edit-date-${set.id}`}
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor={`edit-venue-${set.id}`} className="block text-xs text-grey mb-1">
          venue (optional)
        </label>
        <input
          id={`edit-venue-${set.id}`}
          value={venue}
          onChange={(e) => setVenue(e.target.value)}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor={`edit-description-${set.id}`} className="block text-xs text-grey mb-1">
          description (optional)
        </label>
        <textarea
          id={`edit-description-${set.id}`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className={inputClass}
        />
      </div>
      <div>
        <label htmlFor={`edit-duration-${set.id}`} className="block text-xs text-grey mb-1">
          duration
        </label>
        <input
          id={`edit-duration-${set.id}`}
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          className={inputClass}
        />
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      <div className="flex gap-4">
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={!canSubmit || saving}
          className={!canSubmit || saving ? "opacity-40 cursor-not-allowed" : undefined}
        >
          {saving ? "saving…" : "save"}
        </Button>
        <Button
          variant="secondary"
          onClick={onCancel}
          disabled={saving}
          className={saving ? "opacity-40 cursor-not-allowed" : undefined}
        >
          cancel
        </Button>
      </div>
      {!saving && (
        <p className="text-xs text-grey/70">
          shows up immediately on both /sets and this set's detail page — a browser tab already open
          on /sets needs a reload to see it.
        </p>
      )}
    </div>
  );
}
