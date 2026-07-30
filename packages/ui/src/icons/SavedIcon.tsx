type IconProps = { className?: string };

// Hand-drawn stroked checkmark — the saved-state indicator on offline-save
// buttons, rendered in brand gold. Paired with the floppy DownloadIcon (the
// action glyph) for a clear action-vs-state distinction at 40px: floppy =
// tap to save, check = already saved.
//
// Stroked, NOT filled — matches ShareIcon's family exactly so the card
// action row (floppy / share / play) reads as one consistent thin-line
// family. fill="none", stroke="currentColor", strokeWidth="1.75",
// strokeLinecap="square", strokeLinejoin="miter", 24x24 viewBox — all
// identical to ShareIcon. Two segments: a short down-right hook into a
// long up-right rise, forming a clean checkmark centred in the viewBox.
//
// Not `check_circle`: the card row already has the circular play button,
// and a second circular glyph next to it would visually cluster. The bare
// check reads cleaner as a completion state without competing weight.
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
