import { type ReactNode, useEffect, useRef } from "react";

// Explicit `fixed inset-0 m-auto` restores the user-agent centering that
// Tailwind's preflight strips when it resets `dialog { margin: 0 }`.
// `h-fit` stops `inset-0` from stretching the panel to the full viewport.
const dialogClass =
  "fixed inset-0 m-auto h-fit bg-black border border-gold/40 w-[calc(100vw-2rem)] max-w-md p-6 font-mono animate-fade-in backdrop:bg-black/80";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Header content rendered to the left of the close button. */
  title?: ReactNode;
  /** Accessible name for the dialog (read by screen readers). */
  ariaLabel?: string;
  children: ReactNode;
};

// Generic centered modal built on the native `<dialog>` element. The browser
// owns focus trapping, inert background, and centering — we only own the
// declarative `open` prop, dismissal wiring, and theming.
export function Modal({ open, onClose, title, ariaLabel, children }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!open) return;
    const d = dialogRef.current;
    if (!d || d.open) return;
    d.showModal();
  }, [open]);

  if (!open) return null;

  // Backdrop clicks bubble up to the <dialog> itself with target === currentTarget.
  // Clicks inside the content land on descendants, so they don't match.
  const handleClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  // Escape is caught here (rather than on window) so the keyboard-equivalent of
  // backdrop dismissal lives on the same element as the click handler — keeping
  // a11y linters happy and the dismissal flow self-contained. showModal() auto-
  // focuses the first focusable child, so keydown bubbles into the dialog.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDialogElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      // Suppress the native auto-close on Escape so our onKeyDown owns the
      // dismissal flow — otherwise the dialog closes itself AND we set
      // open=false, briefly desyncing React state from the DOM.
      onCancel={(e) => e.preventDefault()}
      aria-label={ariaLabel}
      aria-modal="true"
      className={dialogClass}
    >
      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="min-w-0 flex-1">{title}</div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 text-grey hover:text-white text-xs tracking-widest cursor-pointer"
        >
          [ x ]
        </button>
      </div>
      {children}
    </dialog>
  );
}
