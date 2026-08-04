import { BracketLabel, cn } from "@form-at/ui";
import { Link, useRouterState } from "@tanstack/react-router";

// Sections config — adding "notifications"/"sessions" later is just
// appending another entry here. Not the public site's Header (that's
// marketing nav); this is an internal tool's section switcher.
const links = [
  { to: "/dashboard", label: "dashboard" },
  { to: "/notifications", label: "notifications" },
  { to: "/sets", label: "sets" },
] as const;

export function AdminNav() {
  const { location } = useRouterState();

  return (
    <nav className="flex items-center gap-6 px-6 py-4 border-b border-grey/10">
      <span className="font-display text-lg lowercase text-gold">form:at admin</span>
      {links.map(({ to, label }) => {
        const isActive = location.pathname.startsWith(to);
        return (
          <Link
            key={to}
            to={to}
            className={cn("font-display text-lg lowercase", isActive && "text-white")}
          >
            {isActive ? <BracketLabel>{label}</BracketLabel> : label}
          </Link>
        );
      })}
    </nav>
  );
}
