import { type ReactNode, useEffect, useRef, useState } from "react";
import { BracketLabel } from "../BracketLabel/BracketLabel";

// Matches the duration on `@utility animate-fade-out` in tokens.css. We stay
// mounted just long enough for that animation to finish before unmounting.
const EXIT_MS = 200;

// Explicit `fixed inset-0 m-auto` restores the user-agent centering that
// Tailwind's preflight strips when it resets `dialog { margin: 0 }`.
// `h-fit` stops `inset-0` from stretching the panel to the full viewport.
const baseDialogClass =
  "fixed inset-0 m-auto h-fit bg-black border border-gold/40 w-[calc(100vw-2rem)] max-w-md p-6 font-mono backdrop:bg-black/80";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Header content rendered to the left of the close button. Kept terse —
   *  variable subjects (long artist names, emails, event titles) should sit
   *  inside the body as a `›` context row, not in the heading. */
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

  // We need two pieces of state to play an exit animation: `show` tracks
  // whether the <dialog> is in the DOM, `isClosing` whether it should be
  // rendering the fade-out keyframe. When the parent flips `open` to false
  // we stay mounted for EXIT_MS so the animation can finish, then unmount.
  const [show, setShow] = useState(open);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (open) {
      setShow(true);
      setIsClosing(false);
      return;
    }
    setIsClosing(true);
    const id = window.setTimeout(() => {
      setShow(false);
      setIsClosing(false);
    }, EXIT_MS);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!show) return;
    const d = dialogRef.current;
    if (!d || d.open) return;
    d.showModal();
  }, [show]);

  if (!show) return null;

  // Backdrop clicks bubble up to the <dialog> itself with target === currentTarget.
  // Clicks inside the content land on descendants, so they don't match.
  //
  // stopPropagation is the modal's event-boundary contract: clicks anywhere
  // inside (content OR backdrop) must NOT leak out to React parents. Native
  // <dialog> + showModal() puts us in the top layer visually, but in the React
  // tree we still sit wherever the consumer mounted us — including inside a
  // clickable parent like <Card>. Without this, the close button's click
  // bubbles up the React tree to the card's onClick and navigates away.
  // Placed BEFORE the backdrop check so backdrop-click-to-close still works
  // (the two are independent).
  const handleClick = (e: React.MouseEvent<HTMLDialogElement>) => {
    e.stopPropagation();
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

  const animationClass = isClosing
    ? "animate-fade-out backdrop:animate-fade-out"
    : "animate-fade-in";

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
      className={`${baseDialogClass} ${animationClass}`}
    >
      <div className="flex items-start justify-between mb-2 gap-4">
        <div className="min-w-0 flex-1">{title}</div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 text-grey hover:text-white text-xs tracking-widest cursor-pointer"
        >
          <BracketLabel>x</BracketLabel>
        </button>
      </div>
      {children}
    </dialog>
  );
}
