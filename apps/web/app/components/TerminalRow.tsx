import type { ReactNode } from "react";

interface TerminalRowProps {
  label: string;
  value: ReactNode;
  dimValue?: boolean;
  className?: string;
}

export function TerminalRow({ label, value, dimValue, className }: TerminalRowProps) {
  return (
    <p className={["text-xs sm:text-sm text-white/30", className].filter(Boolean).join(" ")}>
      <span className="text-gold mr-2">›</span>
      {label}: {dimValue ? <span className="text-white/50">{value}</span> : value}
    </p>
  );
}
