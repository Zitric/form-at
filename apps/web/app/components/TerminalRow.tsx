import type { ReactNode } from "react";
import { cn } from "~/utils/cn";

interface TerminalRowProps {
  label: string;
  value: ReactNode;
  dimValue?: boolean;
  className?: string;
}

export function TerminalRow({ label, value, dimValue, className }: TerminalRowProps) {
  return (
    <p className={cn("t-label sm:t-label-md", className)}>
      <span className="text-gold mr-2">›</span>
      {label}: {dimValue ? <span className="opacity-50">{value}</span> : value}
    </p>
  );
}
