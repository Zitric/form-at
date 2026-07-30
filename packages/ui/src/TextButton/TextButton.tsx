import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../cn";

// Low-emphasis inline text action — the underlined "escape hatch" style used
// inside modals (SaveGateModal's "already installed?" pair, PushOptInModal's
// "not now"). Deliberately NOT a <Button> variant: it carries no brackets and
// must read as secondary to whatever bracket CTA sits above it.
export function TextButton({
  onClick,
  className,
  children,
}: {
  onClick: ButtonHTMLAttributes<HTMLButtonElement>["onClick"];
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-xs text-grey/70 hover:text-grey underline underline-offset-2 self-start cursor-pointer",
        className,
      )}
    >
      {children}
    </button>
  );
}
