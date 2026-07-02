type IconProps = { className?: string };

// Hand-drawn share glyph (vertical bar + chevron-up + tray). Stroked rather
// than filled — currently the only stroked icon in the set; the stroke style
// matches the icon's call-site treatment (subdued grey, hover gold) as a
// circular icon-button. Default 1em sizing for inline use; callers can
// override via className (ShareIconButton uses w-5 h-5).
export function ShareIcon({ className }: IconProps) {
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
      <path d="M12 3v12" />
      <path d="M7 8l5-5 5 5" />
      <path d="M5 14v6h14v-6" />
    </svg>
  );
}
