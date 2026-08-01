import { Button, Label, Modal } from "@form-at/ui";
import { useState } from "react";
import { PushPreview } from "./PushPreview";

interface SendPushFormProps {
  subscriberCount: number;
  onSent: () => void;
}

type SendResult = { total: number; sent: number; failed: number; deadRemoved: number };

const inputClass =
  "w-full bg-black border border-grey/30 px-2 py-1 text-white font-mono text-sm focus:border-gold outline-none";

// The irreversible, real-people's-phones action this whole page exists
// for. Non-negotiable UX this component owns: no single-click send (the
// confirm modal is a hard second step, not a dismissible toast), a
// disabled/busy state that makes a double-click physically unable to
// double-send, and a result state that's never silently discarded.
export function SendPushForm({ subscriberCount, onSent }: SendPushFormProps) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [image, setImage] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = title.trim().length > 0 && body.trim().length > 0;

  const handleOpenConfirm = () => {
    setResult(null);
    setError(null);
    setConfirmOpen(true);
  };

  const handleConfirmSend = async () => {
    setSending(true);
    setError(null);
    try {
      const response = await fetch("/api/send-push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          url: url.trim() || undefined,
          image: image.trim() || undefined,
        }),
      });
      if (!response.ok) {
        setError(response.status === 401 ? "not authorized" : "send failed");
        return;
      }
      const data = (await response.json()) as SendResult;
      setResult(data);
      setConfirmOpen(false);
      setTitle("");
      setBody("");
      setUrl("");
      setImage("");
      onSent();
    } catch {
      setError("send failed — network error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="border border-grey/30 p-4 space-y-3">
        <Label className="text-grey tracking-widest">{"// send_notification"}</Label>
        <div>
          <label htmlFor="push-title" className="block text-xs text-grey mb-1">
            title
          </label>
          <input
            id="push-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="push-body" className="block text-xs text-grey mb-1">
            body
          </label>
          <textarea
            id="push-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="push-url" className="block text-xs text-grey mb-1">
            deep-link url (optional)
          </label>
          <input
            id="push-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="/sets/003"
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="push-image" className="block text-xs text-grey mb-1">
            image url (optional)
          </label>
          <input
            id="push-image"
            value={image}
            onChange={(e) => setImage(e.target.value)}
            placeholder="/images/sets/003.webp"
            className={inputClass}
          />
        </div>
      </div>

      <PushPreview title={title} body={body} url={url || undefined} />

      <Button
        variant="primary"
        onClick={handleOpenConfirm}
        disabled={!canSubmit}
        className={!canSubmit ? "opacity-40 cursor-not-allowed" : undefined}
      >
        send
      </Button>

      {error && <p className="text-xs text-red-400">{error}</p>}
      {result && (
        <p className="text-xs text-grey/70">
          sent {result.sent} / failed {result.failed} / removed {result.deadRemoved} (of{" "}
          {result.total} subscribers)
        </p>
      )}

      <Modal
        open={confirmOpen}
        onClose={() => {
          if (!sending) setConfirmOpen(false);
        }}
        title={<Label className="text-grey">confirm send</Label>}
        ariaLabel="Confirm push notification send"
      >
        <div className="space-y-3">
          <p className="t-body sm:t-body-md text-grey">
            This will send to <span className="text-white">{subscriberCount}</span>{" "}
            {subscriberCount === 1 ? "device" : "devices"}.
          </p>
          <PushPreview title={title} body={body} url={url || undefined} />
          <div className="flex gap-4">
            <Button
              variant="primary"
              onClick={handleConfirmSend}
              disabled={sending}
              className={sending ? "opacity-40 cursor-not-allowed" : undefined}
            >
              {sending ? "sending…" : "confirm send"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => setConfirmOpen(false)}
              disabled={sending}
              className={sending ? "opacity-40 cursor-not-allowed" : undefined}
            >
              cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
