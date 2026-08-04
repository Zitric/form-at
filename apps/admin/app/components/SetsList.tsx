import { Button, Label, Modal, Muted, TerminalRow } from "@form-at/ui";
import { useState } from "react";
import { EditSetForm } from "~/components/EditSetForm";
import type { RecentDeletedSet, SetWithPlayCount } from "~/data/sets-admin";

interface SetsListProps {
  sets: SetWithPlayCount[];
  recentDeletions: RecentDeletedSet[];
  onChanged: () => void;
}

function fmtWhen(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Shown below the list so a duplicate/accidental repeat delete is visible
// BEFORE it happens, mirroring RecentPushSends' exact reasoning for the
// notifications page. Also the thing that makes the admin_deleted_sets
// audit log (PR6 review item 2a) actually visible day-to-day, rather than
// a write-only table Julian would need `wrangler` to inspect.
function RecentlyDeletedSets({ deletions }: { deletions: RecentDeletedSet[] }) {
  return (
    <div className="border border-grey/30 p-4">
      <Label className="mb-2 text-grey tracking-widest">{"// recently_deleted"}</Label>
      {deletions.length === 0 ? (
        <Muted>nothing deleted yet</Muted>
      ) : (
        <div className="space-y-1">
          {deletions.map((d, i) => (
            <TerminalRow
              key={`${d.deletedAt}-${i}`}
              label={`${fmtWhen(d.deletedAt)} · ${d.deletedByEmail} · ${d.title} (${d.artist})`}
              value={`${d.playCountAtDeletion} plays at deletion · id: ${d.setId}`}
              dimValue
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Delete confirmation, play-count-gated (PR6 review item 1a): the admin
// list has no structural way to tell "uploaded five minutes ago" apart
// from "live since May" other than actual play count — a hardcoded
// "these 4 ids are legacy" list would be a brittle proxy that stops
// meaning anything once more sets accumulate real history. A set with zero
// plays gets a single confirm click; any recorded plays requires typing
// the exact id before the confirm button enables — proportionate friction
// for a delete that isn't soft (admin_deleted_sets, item 2a, is the
// closest thing to an undo, but re-creating a row by hand is real work).
function DeleteConfirmModal({
  set,
  onClose,
  onDeleted,
}: {
  set: SetWithPlayCount;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsTypedConfirm = set.playCount > 0;
  const canConfirm = !needsTypedConfirm || confirmText === set.id;

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      const response = await fetch("/api/sets", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: set.id }),
      });
      if (!response.ok) {
        setError(
          response.status === 404
            ? "already gone — someone else may have deleted it"
            : response.status === 401
              ? "not authorized"
              : "delete failed — try again",
        );
        return;
      }
      onDeleted();
    } catch {
      setError("delete failed — check your connection and try again");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => {
        if (!deleting) onClose();
      }}
      title={<Label className="text-grey">confirm delete</Label>}
      ariaLabel="Confirm set delete"
    >
      <div className="space-y-3">
        {deleting ? (
          <p className="text-sm text-grey">deleting…</p>
        ) : (
          <>
            <p className="t-body sm:t-body-md text-grey">
              Delete <span className="text-white">{set.title}</span> by{" "}
              <span className="text-white">{set.artist}</span>?
            </p>
            <p className="text-xs text-grey/70">
              This set has <span className="text-white">{set.playCount}</span> recorded plays.
            </p>
            {/* Item 1/2's findings, stated plainly — not just documented. */}
            <p className="text-xs text-grey/70">
              This set won't disappear from the public site until the next deploy — and a browser
              tab already on /sets needs a reload even after that. Anyone who already downloaded it
              for offline listening will keep it until their device's next successful online visit
              after that deploy. The audio/artwork/peaks files themselves are not deleted from
              storage.
            </p>
            {needsTypedConfirm && (
              <div>
                <label htmlFor="delete-confirm-id" className="block text-xs text-grey mb-1">
                  type '{set.id}' to confirm
                </label>
                <input
                  id="delete-confirm-id"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="w-full bg-black border border-grey/30 px-2 py-1 text-white font-mono text-sm focus:border-gold outline-none"
                />
              </div>
            )}
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex gap-4">
              <Button
                variant="fail"
                onClick={handleDelete}
                disabled={!canConfirm}
                className={!canConfirm ? "opacity-40 cursor-not-allowed" : undefined}
              >
                confirm delete
              </Button>
              <Button variant="secondary" onClick={onClose}>
                cancel
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

export function SetsList({ sets, recentDeletions, onChanged }: SetsListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingSet, setDeletingSet] = useState<SetWithPlayCount | null>(null);

  return (
    <div className="space-y-6">
      <div className="border border-grey/30 p-4">
        <Label className="mb-2 text-grey tracking-widest">{"// sets"}</Label>
        {sets.length === 0 ? (
          <Muted>no sets yet</Muted>
        ) : (
          <div className="space-y-3">
            {sets.map((set) =>
              editingId === set.id ? (
                <EditSetForm
                  key={set.id}
                  set={set}
                  onSaved={() => {
                    setEditingId(null);
                    onChanged();
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div key={set.id} className="flex items-center justify-between gap-4">
                  <TerminalRow
                    label={`${set.artist} @ ${set.title} · ${set.date}`}
                    value={`${set.playCount} plays`}
                    dimValue
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="secondary" onClick={() => setEditingId(set.id)}>
                      edit
                    </Button>
                    <Button variant="fail" onClick={() => setDeletingSet(set)}>
                      delete
                    </Button>
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </div>

      <RecentlyDeletedSets deletions={recentDeletions} />

      {deletingSet && (
        <DeleteConfirmModal
          set={deletingSet}
          onClose={() => setDeletingSet(null)}
          onDeleted={() => {
            setDeletingSet(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}
