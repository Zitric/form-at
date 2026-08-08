import { BracketLabel, cn } from "@form-at/ui";

export type DashboardTabId = "growth" | "usage" | "sets";

// Short, single-word labels — the iPhone SE (375px) bracket-nowrap
// constraint (CLAUDE.md) means these must survive 3-across without
// wrapping, unlike the verbose `// install_funnel`-style in-panel headers.
// `usage` first because it's the landing tab (see dashboard.tsx) — tab order
// should match which one opens by default.
const TABS: { id: DashboardTabId; label: string }[] = [
  { id: "usage", label: "usage" },
  { id: "growth", label: "growth" },
  { id: "sets", label: "sets" },
];

interface DashboardTabsProps {
  active: DashboardTabId;
  onChange: (tab: DashboardTabId) => void;
}

// Mirrors AdminNav's own active-state convention (BracketLabel swap on the
// active entry) rather than inventing a new visual language for a nested
// nav level — see PWA_PROGRESS.md's Phase C entry for why this is a local
// component rather than a new @form-at/ui primitive.
export function DashboardTabs({ active, onChange }: DashboardTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="dashboard sections"
      className="flex gap-6 mb-6 border-b border-grey/10 pb-3"
    >
      {TABS.map(({ id, label }) => {
        const isActive = id === active;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(id)}
            className={cn(
              "font-display text-lg lowercase cursor-pointer",
              isActive ? "text-white" : "text-grey/70",
            )}
          >
            {isActive ? <BracketLabel>{label}</BracketLabel> : label}
          </button>
        );
      })}
    </div>
  );
}
