import type { ReactNode } from "react";
import { Image } from "~/components/Image";
import { cn } from "~/utils/cn";

interface CardProps {
  /** Image src (without base path, e.g., "djs/id" or "sets/id") */
  imageSrc?: string;
  /** Image alt text */
  imageAlt?: string;
  /** Primary text (title, name, etc.) - optional if using children */
  primary?: string;
  /** Secondary text (artist, subtitle, etc.) - optional if using children */
  secondary?: string;
  /** Right-side action button */
  action?: ReactNode;
  /** Callback when card is clicked */
  onClick?: () => void;
  /** Optional className for styling */
  className?: string;
  /** Index for staggered animation */
  animationDelay?: number;
  /** Dynamic children for flexible content */
  children?: ReactNode;
}

export function Card({
  imageSrc,
  imageAlt,
  primary,
  secondary,
  action,
  onClick,
  className,
  animationDelay = 0,
  children,
}: CardProps) {
  const containerClass = cn(
    "flex items-center gap-4 p-4 border border-grey/10 hover:border-purple transition-colors mb-8 rounded-lg group text-left w-full",
    onClick && "cursor-pointer",
    className,
  );
  const animationStyle = {
    animation: "fadeInUp 0.5s ease-out forwards",
    animationDelay: `${animationDelay * 75}ms`,
    opacity: 0,
  };

  const content = (
    <>
      {imageSrc && (
        <div className="shrink-0 w-20 h-20 sm:w-28 sm:h-28 bg-black/40 border border-grey/20 overflow-hidden">
          <Image
            src={imageSrc}
            alt={imageAlt || primary || ""}
            sizes="(min-width: 640px) 112px, 80px"
            className="w-full h-full object-cover"
          />
        </div>
      )}

      <div className="flex-1 min-w-0">
        {children ? (
          children
        ) : (
          <>
            <p className="text-sm sm:text-base tracking-tight truncate">{primary}</p>
            {secondary && <p className="text-xs sm:text-sm text-grey truncate">{secondary}</p>}
          </>
        )}
      </div>
    </>
  );

  // When the card has an `action` (e.g. a play button), the outer element can't
  // be a <button> — nesting interactive elements is invalid HTML. We fall back
  // to a div with explicit ARIA + keyboard handling so screen readers still see
  // it as activatable.
  if (action) {
    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (onClick && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        onClick();
      }
    };
    return (
      <div
        onClick={onClick}
        onKeyDown={handleKeyDown}
        role={onClick ? "button" : undefined}
        tabIndex={onClick ? 0 : undefined}
        className={containerClass}
        style={animationStyle}
      >
        {content}
        <div className="shrink-0 pl-2">{action}</div>
      </div>
    );
  }

  // No nested action — render as a real <button> for native a11y + keyboard.
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={containerClass} style={animationStyle}>
        {content}
      </button>
    );
  }

  return (
    <div className={containerClass} style={animationStyle}>
      {content}
    </div>
  );
}
