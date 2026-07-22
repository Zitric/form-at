import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ToastShell } from "~/components/ToastShell";

// Locks the shared surface all three toast components migrated onto
// (2026-07-22): variant → color classes (mirroring Button.tsx's
// Record<Variant, string> idiom, not a new mechanism), the shared padding/
// layout, and that an inline `style` override (Toast's own timed enter/
// exit) actually wins over the default entrance class via CSS specificity
// rather than needing to be conditionally dropped.

describe("ToastShell — variant → class mapping", () => {
  it("default variant renders gold-toned border/text classes", () => {
    render(
      <ToastShell variant="default" onClick={vi.fn()}>
        content
      </ToastShell>,
    );
    const button = screen.getByRole("button", { name: "content" });
    expect(button.className).toContain("border-gold/40");
    expect(button.className).toContain("text-gold");
    expect(button.className).not.toContain("red");
  });

  it("error variant renders red-toned border/text classes, never gold", () => {
    render(
      <ToastShell variant="error" onClick={vi.fn()}>
        content
      </ToastShell>,
    );
    const button = screen.getByRole("button", { name: "content" });
    expect(button.className).toContain("border-red-400/40");
    expect(button.className).toContain("text-red-400");
    expect(button.className).not.toContain("gold");
  });

  it("both variants share the same padding/layout/entrance classes", () => {
    const { unmount } = render(
      <ToastShell variant="default" onClick={vi.fn()}>
        a
      </ToastShell>,
    );
    const defaultClass = screen.getByRole("button", { name: "a" }).className;
    unmount();

    render(
      <ToastShell variant="error" onClick={vi.fn()}>
        b
      </ToastShell>,
    );
    const errorClass = screen.getByRole("button", { name: "b" }).className;

    for (const shared of ["px-5", "py-3.5", "gap-4", "max-w-sm", "animate-fade-in-up"]) {
      expect(defaultClass).toContain(shared);
      expect(errorClass).toContain(shared);
    }
  });
});

describe("ToastShell — behavior wiring", () => {
  it("fires onClick when tapped", async () => {
    const onClick = vi.fn();
    render(
      <ToastShell variant="default" onClick={onClick}>
        tap me
      </ToastShell>,
    );
    await userEvent.setup().click(screen.getByRole("button", { name: "tap me" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("applies ariaLabel and role to the accessible name / wrapper", () => {
    render(
      <ToastShell variant="error" onClick={vi.fn()} ariaLabel="Dismiss" role="alert">
        message
      </ToastShell>,
    );
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("an inline style override wins over the default entrance class (CSS specificity, not conditional logic)", () => {
    render(
      <ToastShell
        variant="default"
        onClick={vi.fn()}
        style={{ animation: "fadeOutDown 250ms ease-in forwards" }}
      >
        exiting
      </ToastShell>,
    );
    const button = screen.getByRole("button", { name: "exiting" });
    // The class is still present (no conditional dropping)...
    expect(button.className).toContain("animate-fade-in-up");
    // ...but the inline style is what actually governs the animation.
    expect(button.style.animation).toContain("fadeOutDown");
  });
});
