import type { ReactNode } from "react";

type As = "p" | "span" | "div";

interface TextProps {
  children: ReactNode;
  className?: string;
  as?: As;
}

function cx(...parts: (string | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export function Label({ children, className, as: Tag = "p" }: TextProps) {
  return <Tag className={cx("text-xs sm:text-sm text-white/30", className)}>{children}</Tag>;
}

export function Body({ children, className, as: Tag = "p" }: TextProps) {
  return <Tag className={cx("text-sm sm:text-base text-white/40", className)}>{children}</Tag>;
}

export function Muted({ children, className, as: Tag = "span" }: TextProps) {
  return <Tag className={cx("text-[10px] sm:text-xs text-white/20", className)}>{children}</Tag>;
}
