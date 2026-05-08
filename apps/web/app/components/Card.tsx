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
  const handleKeyDown = (e: React.KeyboardEvent) => {
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
      className={cn(
        "flex items-center gap-4 p-4 border border-grey/10 hover:border-purple transition-colors mb-8 rounded-lg",
        onClick && "cursor-pointer",
        className,
      )}
      style={{
        animation: "fadeInUp 0.5s ease-out forwards",
        animationDelay: `${animationDelay * 75}ms`,
        opacity: 0,
      }}
    >
      {/* Image */}
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

      {/* Content */}
      <div className="flex-1 min-w-0">
        {children ? (
          children
        ) : (
          <>
            <p className="font-display text-base sm:text-lg tracking-tight truncate">{primary}</p>
            {secondary && <p className="text-xs sm:text-sm text-grey truncate">{secondary}</p>}
          </>
        )}
      </div>

      {/* Action button */}
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
