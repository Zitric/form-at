type IconProps = { className?: string };

// Hand-drawn; replaces the colored-emoji rendering of ⏮/⏸/▶/⏭ that system
// fonts apply on Android / iOS and that breaks the terminal aesthetic.
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
