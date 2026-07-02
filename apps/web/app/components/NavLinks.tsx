import { Link, useRouterState } from "@tanstack/react-router";
import { BracketLabel } from "~/components/BracketLabel";
import { cn } from "~/utils/cn";

const links = [
  { to: "/", label: "home", exact: true },
  { to: "/sets", label: "sets" },
  { to: "/events", label: "events" },
  { to: "/djs", label: "djs" },
] as const;

interface NavLinksProps {
  className?: string;
  itemClassName?: string;
  activeClassName?: string;
}

export function NavLinks({ className, itemClassName, activeClassName }: NavLinksProps) {
  const { location } = useRouterState();

  return (
    <nav className={className}>
      {links.map(({ to, label }) => {
        const isActive = to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
        return (
          <Link
            key={to}
            to={to}
            preload="intent"
            className={cn(
              itemClassName,
              isActive && activeClassName,
              "font-display text-lg lowercase",
            )}
          >
            {isActive ? <BracketLabel>{label}</BracketLabel> : label}
          </Link>
        );
      })}
    </nav>
  );
}
