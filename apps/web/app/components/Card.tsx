import type { ReactNode } from "react";
import { Image } from "~/components/Image";
import { cn } from "~/utils/cn";

/** Picks the card's visual treatment:
 *  - `default` — neutral grey border, hover shifts to purple. Use for list items.
 *  - `cta` — gold border with pulsing glow, matching the home + `play_set` CTAs.
 *    Use when the card is the primary action on the page (e.g. the next event). */
type CardVariant = "default" | "cta";

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
  /** Visual treatment — see CardVariant for the catalog. Defaults to `default`. */
  variant?: CardVariant;
  /** When true, the image is hidden below `sm` so phone widths get the full
   * row for text. Use for set cards (list view doesn't need the artwork); keep
   * off for DJ cards where the photo is the identity. */
  hideImageOnMobile?: boolean;
}

const variantClass: Record<CardVariant, string> = {
  default: "border border-grey/10 hover:border-purple",
  cta: "border-2 border-gold shadow-[0_0_15px_rgba(197,133,56,0.2)] hover:shadow-[0_0_25px_rgba(197,133,56,0.4)]",
};

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
  variant = "default",
  hideImageOnMobile = false,
}: CardProps) {
  const containerClass = cn(
    // Mobile drops the inter-child gap to 4px (gap-1) so the text column
    // gets back the 12px the old gap-4 was eating beside the action
    // cluster — at iPhone SE widths that 12px is the difference between
    // "Brandon Lee Vear @ Form:at 002" reading clean vs truncating
    // mid-name. sm+ keeps gap-4 because DJ cards on tablet/desktop have a
    // visible image that needs the wider breathing room from the text.
    "flex items-center gap-1 2xs:gap-4 p-4 transition-all mb-8 rounded-card group text-left w-full",
    variantClass[variant],
    onClick && "cursor-pointer",
    className,
  );
  // The CTA variant layers a continuous border-pulse on top of the one-shot
  // entry animation. Inline `animation` shorthand beats Tailwind classes here,
  // so we have to compose both animations into the same property — using
  // animate-border-pulse as a class gets clobbered by the entry animation.
  const animationStyle =
    variant === "cta"
      ? {
          animation: "fadeInUp 0.5s ease-out forwards, border-pulse 2s ease-in-out infinite",
          animationDelay: `${animationDelay * 75}ms, 0s`,
          opacity: 0,
        }
      : {
          animation: "fadeInUp 0.5s ease-out forwards",
          animationDelay: `${animationDelay * 75}ms`,
          opacity: 0,
        };

  const content = (
    <>
      {imageSrc && (
        <div
          className={cn(
            "shrink-0 w-16 h-16 sm:w-28 sm:h-28 bg-black/40 border border-grey/20 overflow-hidden rounded-card",
            hideImageOnMobile && "hidden sm:block",
          )}
        >
          <Image
            src={imageSrc}
            alt={imageAlt || primary || ""}
            sizes="(min-width: 640px) 112px, 64px"
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
        <div className="shrink-0">{action}</div>
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
