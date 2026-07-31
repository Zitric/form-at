type IconProps = { className?: string };

// Material Symbols `install_desktop` (monitor with down-arrow). Same shape as
// the address-bar install glyph desktop Chrome / Edge / ChromeOS render — used
// inline in InstallPromptModal's chromium-manual desktop tail so the user sees
// the actual icon they should look for. Follows this folder's icon convention:
// 1em sizing inherits the surrounding font-size, fills via `currentColor` so
// it tracks text color (and any hover transition), aria-hidden because the
// words "install icon" already convey meaning to screen readers — the glyph
// is visual reinforcement only.
//
// Material's source viewBox is `0 -960 960 960` (negative-y origin — Material's
// canonical coordinate system). Preserved as-is; the SVG transform handles
// rendering at 1em.
export function InstallIcon({ className }: IconProps) {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 -960 960 960"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M320-120v-80H160q-33 0-56.5-23.5T80-280v-480q0-33 23.5-56.5T160-840h320v80H160v480h640v-120h80v120q0 33-23.5 56.5T800-200H640v80H320Zm360-280L480-600l56-56 104 103v-287h80v287l104-103 56 56-200 200Z" />
    </svg>
  );
}
