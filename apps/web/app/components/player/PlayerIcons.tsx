// Inline SVGs sized to 1em so they inherit the surrounding font-size.
// Replaces Unicode media chars (⏮ ⏸ ▶ ⏭) which render as colored emoji on
// Android / iOS via system fonts and break the terminal aesthetic.

type IconProps = { className?: string };

export function PlayIcon({ className }: IconProps) {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M3 2v12l11-6z" />
    </svg>
  );
}

export function PauseIcon({ className }: IconProps) {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M3 2h4v12H3zM9 2h4v12H9z" />
    </svg>
  );
}

export function PrevIcon({ className }: IconProps) {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M3 2h2v12H3zM6 8l8-6v12z" />
    </svg>
  );
}

export function NextIcon({ className }: IconProps) {
  return (
    <svg
      width="1em"
      height="1em"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M11 2h2v12h-2zM2 2v12l8-6z" />
    </svg>
  );
}
