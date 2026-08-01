import { cn } from "@form-at/ui";
import type { ReactNode } from "react";

interface DashboardCardProps {
  className?: string;
  children: ReactNode;
}

// Sharp edges, not `rounded-card` — this is structural chrome (a metric
// group container), not a tappable content surface, per CLAUDE.md's
// rounded-corner rule.
export function DashboardCard({ className, children }: DashboardCardProps) {
  return <div className={cn("border border-grey/30 p-4", className)}>{children}</div>;
}
