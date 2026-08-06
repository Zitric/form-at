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
// notifications page. Also what makes the admin_deleted_sets audit log visible
// day-to-day, rather than a write-only table needing `wrangler` to inspect.
//
// Each entry gets a `[ restore ]` action. Entries drop off this list once
// restored (fetchRecentDeletedSets filters `restored_at IS NULL`), so no stale
// restore button is left pointing at a set that's already back.
function RecentlyDeletedSets({
  deletions,
  onRestoreClick,
}: {
  deletions: RecentDeletedSet[];
  onRestoreClick: (deletion: RecentDeletedSet) => void;
}) {
  return (
    <div className="border border-grey/30 p-4">
      <Label className="mb-2 text-grey tracking-widest">{"// recently_deleted"}</Label>
      {deletions.length === 0 ? (
        <Muted>nothing deleted yet</Muted>
      ) : (
        <div className="space-y-1">
          {deletions.map((d) => (
            <div key={d.logId} className="flex items-center justify-between gap-4">
              <TerminalRow
                label={`${fmtWhen(d.deletedAt)} · ${d.deletedByEmail} · ${d.title} (${d.artist})`}
                value={`${d.playCountAtDeletion} plays at deletion · id: ${d.setId}`}
                dimValue
              />
              <Button variant="secondary" onClick={() => onRestoreClick(d)} className="shrink-0">
                restore
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Single click, deliberately NOT typed-confirmation-gated the way delete is.
// Delete's gate scales friction with a measurable signal (how much play history
// is at stake); whether a deleted set SHOULD come back is a binary human
// judgement no count can express, so a typed field here would be friction with
// no signal behind it. The mitigation is the entry point instead: this button
// only exists after deliberately opening "recently deleted" and picking a named
// entry — never a bulk action or a stray click.
//
// The copy must lead with the consequence: restoring republishes to the public
// site IMMEDIATELY, via the live-D1 read on every /sets request, unlike
// delete's deploy-lagged disappearance. Don't soften it to "safe because
// non-destructive".
function RestoreConfirmModal({
  deletion,
  onClose,
  onRestored,
}: {
  deletion: RecentDeletedSet;
  onClose: () => void;
  onRestored: () => void;
}) {
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRestore = async () => {
    setRestoring(true);
    setError(null);
    try {
      const response = await fetch("/api/sets/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deletion.logId }),
      });
      if (!response.ok) {
        if (response.status === 401) {
          setError("not authorized");
          return;
        }
        // 404/422/409 all carry a specific { message } body (routes/api/sets/restore.ts) —
        // surface it verbatim rather than a generic "restore failed", since each
        // failure mode needs its own explanation (already restored, files gone,
        // id reused).
        const body = (await response.json().catch(() => null)) as { message?: string } | null;
        setError(body?.message ?? "restore failed — try again");
        return;
      }
      onRestored();
    } catch {
      setError("restore failed — check your connection and try again");
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => {
        if (!restoring) onClose();
      }}
      title={<Label className="text-grey">confirm restore</Label>}
      ariaLabel="Confirm set restore"
    >
      <div className="space-y-3">
        {restoring ? (
          <p className="text-sm text-grey">restoring…</p>
        ) : (
          <>
            <p className="t-body sm:t-body-md text-grey">
              Restoring makes <span className="text-white">{deletion.title}</span> by{" "}
              <span className="text-white">{deletion.artist}</span> live on the public site again,
              immediately.
            </p>
            <p className="text-xs text-grey/70">
              If it already disappeared from someone's offline downloads before now, restoring the
              row does not bring those back — they'd need to save it again.
            </p>
            <p className="text-xs text-grey/70">
              Its optimized artwork may not exist yet either, if a deploy happened while this was
              deleted — it'll show the original image until the next deploy regenerates the
              responsive variants. Expected, not a bug.
            </p>
            {error && <p className="text-xs text-red-400">{error}</p>}
            <div className="flex gap-4">
              <Button variant="primary" onClick={handleRestore}>
                confirm restore
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

// Delete confirmation, gated on play count: the admin list has no structural
// way to tell "uploaded five minutes ago" apart from "live for months" other
// than actual play count, and a hardcoded "these 4 ids are legacy" list would
// be a brittle proxy that stops meaning anything as more sets accumulate
// history. Zero plays gets a single confirm click; any recorded plays requires
// typing the exact id before confirm enables — proportionate friction for a
// delete that isn't soft.
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
  const [restoringDeletion, setRestoringDeletion] = useState<RecentDeletedSet | null>(null);

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

      <RecentlyDeletedSets deletions={recentDeletions} onRestoreClick={setRestoringDeletion} />

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

      {restoringDeletion && (
        <RestoreConfirmModal
          deletion={restoringDeletion}
          onClose={() => setRestoringDeletion(null)}
          onRestored={() => {
            setRestoringDeletion(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}
