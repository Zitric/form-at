type IconProps = { className?: string };

// Hand-drawn stroked floppy disk — the "save this set for offline listening"
// action glyph, on set-list card save buttons and the detail page's save button
// (not-saved / failed-retry / evicted states, plus the install-gate tap).
// Floppy = action, check = state: SavedIcon is the paired state glyph, and the
// two must stay visually distinct at 40px.
//
// Stroked, NOT filled, with stroke attributes identical to ShareIcon's — the
// card action row (floppy / share / play) has to read as one thin-line family,
// so keep them in step. `currentColor` strokes let hover and state transitions
// (text-grey → text-gold, text-red-400 on failure) work without per-state SVG.
//
// InstallIcon stays filled (Material Symbols) because it lives in the install
// modal rather than the card action row, where it isn't competing with this
// family.
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
