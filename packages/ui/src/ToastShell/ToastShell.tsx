import type { CSSProperties, ReactNode } from "react";
import { cn } from "../cn";

// Shared surface for every toast-style pill — `UpdateToast`, the generic
// ephemeral `Toast`, and `PlaybackErrorToast` (extracted 2026-07-22: all
// three had copy-identical positioning and were converging on the same
// padding/entrance treatment, first shipped by `UpdateToast`'s 2026-07-18
// polish). `variant` mirrors `Button.tsx`'s established pattern — a plain
// `Record<Variant, string>` lookup — rather than reaching for a new
// mechanism (e.g. `cva`) for a two-value color switch.
//
//   "default" — the brand gold offer/status treatment (UpdateToast, Toast).
//   "error"   — red equivalent, same mechanics, preserves the urgency read
//               (PlaybackErrorToast). NEVER swap red → gold — colour carries
//               semantics here, same rule as `BracketLabel`'s tones.
//
// Owns: the fixed-position wrapper (bottom math shared byte-for-byte across
// all three before this extraction — verified fresh, not assumed), and the
// button's structural classes (bg-black, border, padding sized to the H2
// 44px touch-target floor, gap, max-w, transition, cursor). Does NOT own:
// message content, per-child text color/flex (each consumer's children
// still decide their own layout — e.g. PlaybackErrorToast's message keeps
// `flex-1` to push its `[ x ]` to the far edge, UpdateToast's doesn't), or
// entrance timing — `animate-fade-in-up` is the default, but an inline
// `style` prop (Toast's own timed enter/exit) wins via ordinary CSS
// specificity (inline style always beats a class), so passing one doesn't
// require conditionally dropping the class.
// Not exported — every consumer passes the variant as a string literal
// ("default" | "error"); nothing imports this type name directly.
type ToastVariant = "default" | "error";

const variantClass: Record<ToastVariant, string> = {
  default:
    "border-gold/40 hover:border-gold/70 active:border-gold text-gold hover:text-white active:text-white",
  error:
    "border-red-400/40 hover:border-red-400/70 active:border-red-400 text-red-400 hover:text-red-300 active:text-red-300",
};

type Props = {
  variant: ToastVariant;
  onClick: () => void;
  /** Accessible name for icon-only / ambiguous surfaces (PlaybackErrorToast,
   *  the generic Toast). Omit when the visible text content already reads
   *  as the accessible name (UpdateToast). */
  ariaLabel?: string;
  /** `"alert"` for surfaces that should interrupt a screen reader
   *  (PlaybackErrorToast). Omitted elsewhere. */
  role?: "alert";
  /** Escape hatch for a consumer's own child-layout needs — merged onto the
   *  button, same convention as `Button.tsx`'s `className` prop. */
  className?: string;
  /** Overrides the default entrance with a consumer-owned animation (Toast's
   *  timed fadeInUp/fadeOutDown pair) — see the file doc comment for why no
   *  conditional class-dropping is needed. */
  style?: CSSProperties;
  /** Stacking-order Tailwind class (e.g. `"z-50"`) for the fixed wrapper —
   *  this package owns no opinion on app-wide z-index; the app passes its own
   *  token so ToastShell never hardcodes a value that could collide with the
   *  app's other fixed surfaces. Defaults to `"z-50"`, matching every current
   *  consumer. */
  zIndexClassName?: string;
  children: ReactNode;
};

export function ToastShell({
  variant,
  onClick,
  ariaLabel,
  role,
  className,
  style,
  zIndexClassName = "z-50",
  children,
}: Props) {
  return (
    <div
      // Bottom math shared byte-for-byte by every fixed toast-style surface:
      // nav (55) + mini-player (50) + safe-area + 12px gap, mobile; static
      // ~78px desktop player, no BottomNav, on `sm:`.
      className={cn(
        "fixed inset-x-0 flex items-center justify-center pointer-events-none px-4 bottom-[calc(105px+env(safe-area-inset-bottom)+12px)] sm:bottom-[100px]",
        zIndexClassName,
      )}
      role={role}
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        style={style}
        className={cn(
          "pointer-events-auto bg-black border text-xs font-mono flex items-center gap-4 max-w-sm px-5 py-3.5 transition-colors cursor-pointer animate-fade-in-up",
          variantClass[variant],
          className,
        )}
      >
        {children}
      </button>
    </div>
  );
}
