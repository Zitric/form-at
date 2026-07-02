type IconProps = { className?: string };

// Hand-drawn stroked floppy disk — call-to-action glyph for "save this set
// for offline listening". Used on the set-list card save buttons and on the
// detail page's save button for not-saved / failed-retry / evicted states,
// plus the not-installed install-gate tap. The floppy = action; saved-state
// uses a stroked check (SavedIcon) for the clearest action-vs-state
// distinction at 40px.
//
// Stroked, NOT filled — matches ShareIcon's family exactly so the card
// action row (floppy / share / play) reads as one consistent thin-line
// family. fill="none", stroke="currentColor", strokeWidth="1.75",
// strokeLinecap="square", strokeLinejoin="miter", 24x24 viewBox — all
// identical to ShareIcon. Three paths: outer body with cut top-right
// corner (the floppy silhouette), upper slider rectangle (the metal
// write-protect element), lower label rectangle (the sticker area).
// `currentColor` strokes track text colour so hover / state transitions
// (text-grey → text-gold, text-red-400 on failure) just work.
//
// InstallIcon stays filled (Material Symbols) — it lives in the install
// modal, not in the card action row, so it isn't competing visually with
// the stroked family there.
export function DownloadIcon({ className }: IconProps) {
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
      <path d="M4 4 L16 4 L20 8 L20 20 L4 20 Z" />
      <path d="M7 5 L15 5 L15 9 L7 9 Z" />
      <path d="M7 14 L17 14 L17 20 L7 20 Z" />
    </svg>
  );
}
