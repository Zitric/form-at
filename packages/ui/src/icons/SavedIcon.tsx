type IconProps = { className?: string };

// Hand-drawn stroked checkmark — the saved-state indicator on offline-save
// buttons, in brand gold. Paired with the floppy DownloadIcon (the action
// glyph): floppy = tap to save, check = already saved, and the two must stay
// distinguishable at 40px.
//
// Stroked, NOT filled, with stroke attributes identical to ShareIcon's — keep
// them in step so the card action row reads as one thin-line family.
//
// Deliberately not `check_circle`: the card row already has the circular play
// button, and a second circular glyph beside it clusters visually.
export function SavedIcon({ className }: IconProps) {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      className={className}
    >
      <path d="M5 12 L10 17 L19 7" />
    </svg>
  );
}
