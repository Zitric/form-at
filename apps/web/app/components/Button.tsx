import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { BracketLabel } from "~/components/BracketLabel";
import { cn } from "~/utils/cn";

// Form:at's design-system button. Three variants share the terminal-bracket
// vocabulary so the whole app reads as one console UI:
//
//   secondary — the default. Grey text with gold brackets that stay gold on
//               hover (the gold IS the interactive signal); inner text moves
//               grey → white. Used for almost every CTA in the app.
//   fail      — same shape as secondary but red. Red brackets stay red on
//               hover; inner text moves red-400 → red-300. RED carries
//               semantics (this is the failure/destructive surface) — never
//               unify to gold for a single-look refactor.
//   primary   — the one heavyweight CTA: pulsing gold border, glow on hover,
//               icon-and-label content. No brackets — the border IS the
//               container. Caller composes icon + label inside.
//
// Children API: callers pass label TEXT for secondary/fail (the component
// wraps it in <BracketLabel>); callers pass arbitrary children for primary
// (icon + label live inside, since the play button needs PlayIcon/PauseIcon).
// Nobody hand-rolls `[ label ]` strings or bracket spans — that lives in
// BracketLabel.tsx now.
//
// className is the escape hatch for positional overrides (modal text-left,
// page-level w-full / mb-6!, etc). It's merged via twMerge so callers can
// override variant defaults cleanly when layout needs it.

type Variant = "primary" | "secondary" | "fail";

const variantClass: Record<Variant, string> = {
  secondary:
    "text-sm text-grey hover:text-white transition-colors tracking-widest cursor-pointer whitespace-nowrap",
  fail: "text-sm text-red-400 hover:text-red-300 transition-colors tracking-widest cursor-pointer whitespace-nowrap",
  primary:
    "flex items-center justify-center gap-4 border-2 border-gold px-6 py-4 text-sm text-grey shadow-[0_0_15px_rgba(197,133,56,0.2)] hover:shadow-[0_0_25px_rgba(197,133,56,0.4)] hover:cursor-pointer transition-all group",
};

const primaryStyle: CSSProperties = { animation: "border-pulse 2s infinite" };

type Props = {
  variant: Variant;
  type?: "button" | "submit";
  onClick?: ButtonHTMLAttributes<HTMLButtonElement>["onClick"];
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  children: ReactNode;
};

export function Button({
  variant,
  type = "button",
  onClick,
  disabled,
  className,
  "aria-label": ariaLabel,
  children,
}: Props) {
  const content =
    variant === "secondary" ? (
      <BracketLabel tone="gold">{children}</BracketLabel>
    ) : variant === "fail" ? (
      <BracketLabel tone="red">{children}</BracketLabel>
    ) : (
      children
    );

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(variantClass[variant], className)}
      style={variant === "primary" ? primaryStyle : undefined}
    >
      {content}
    </button>
  );
}
