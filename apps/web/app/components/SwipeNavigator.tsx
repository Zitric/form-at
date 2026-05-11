import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useDrag } from "@use-gesture/react";
import { useRef, useState } from "react";
import { useStore } from "~/store";

const ROUTES = ["/", "/sets", "/events", "/djs"] as const;
const SWIPE_PX = 80;
const SWIPE_VX = 0.5;
const DURATION = 220;
// w-1 (4px) + gap-1.5 (6px) = 10px per dot step
const DOT_STEP = 10;

function routeIndex(pathname: string): number {
  return ROUTES.findIndex((r) => (r === "/" ? pathname === "/" : pathname.startsWith(r)));
}

export function SwipeNavigator() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const nowPlaying = useStore((s) => s.nowPlaying);
  const [offset, setOffset] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const busy = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dotsIndicatorRef = useRef<HTMLDivElement>(null);

  const idx = routeIndex(pathname);

  const bind = useDrag(
    ({ movement: [mx], last, velocity: [vx] }) => {
      if (busy.current) return;

      if (!last) {
        const atStart = idx === 0 && mx > 0;
        const atEnd = idx === ROUTES.length - 1 && mx < 0;
        setOffset(atStart || atEnd ? mx * 0.15 : mx);
        // Animate dots indicator directly — no React re-render needed
        if (dotsIndicatorRef.current) {
          const frac = Math.max(-1, Math.min(1, -mx / window.innerWidth));
          dotsIndicatorRef.current.style.transition = "none";
          dotsIndicatorRef.current.style.transform = `translateX(${(idx + frac) * DOT_STEP}px)`;
        }
        return;
      }

      const swiped = Math.abs(mx) > SWIPE_PX || Math.abs(vx) > SWIPE_VX;
      const goingLeft = mx < 0;
      const next = goingLeft ? idx + 1 : idx - 1;

      if (swiped && next >= 0 && next < ROUTES.length) {
        busy.current = true;
        if (dotsIndicatorRef.current) {
          dotsIndicatorRef.current.style.transition = `transform ${DURATION}ms ease`;
          dotsIndicatorRef.current.style.transform = `translateX(${next * DOT_STEP}px)`;
        }

        // Clone current content so it can animate out while the new page slides in.
        // cloneNode captures the rendered DOM including current translateX position.
        const container = containerRef.current;
        const inner = container?.firstElementChild as HTMLDivElement | null;
        if (container && inner) {
          const snapshot = inner.cloneNode(true) as HTMLDivElement;
          Object.assign(snapshot.style, {
            position: "absolute",
            top: "0",
            left: "0",
            width: "100%",
            pointerEvents: "none",
            zIndex: "1",
            transition: "none",
          });
          container.appendChild(snapshot);
          // One rAF to let the browser paint the snapshot before starting its transition
          requestAnimationFrame(() => {
            snapshot.style.transition = `transform ${DURATION}ms ease`;
            snapshot.style.transform = `translateX(${goingLeft ? -window.innerWidth : window.innerWidth}px)`;
          });
          setTimeout(() => snapshot.remove(), DURATION + 50);
        }

        // Navigate and instantly place the new page off-screen on the opposite side
        const route = ROUTES[next];
        if (route) navigate({ to: route });
        setOffset(goingLeft ? window.innerWidth : -window.innerWidth);

        // Two rAFs so the browser paints the off-screen position before transitioning.
        // This runs concurrently with the snapshot exit above.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setTransitioning(true);
            setOffset(0);
            setTimeout(() => {
              setTransitioning(false);
              busy.current = false;
            }, DURATION);
          });
        });
      } else {
        // Snap indicator back to current page
        if (dotsIndicatorRef.current) {
          dotsIndicatorRef.current.style.transition = `transform ${DURATION}ms ease`;
          dotsIndicatorRef.current.style.transform = `translateX(${idx * DOT_STEP}px)`;
        }
        setTransitioning(true);
        setOffset(0);
        setTimeout(() => setTransitioning(false), DURATION);
      }
    },
    { axis: "x", filterTaps: true },
  );

  // Dots sit above BottomNav (≈52px) and optionally the player bar (52px)
  const dotsBottom = nowPlaying ? 137 : 59;

  return (
    <>
      <div
        ref={containerRef}
        {...bind()}
        style={{ touchAction: "pan-y", overflowX: "hidden", position: "relative" }}
      >
        <div
          style={{
            transform: `translateX(${offset}px)`,
            transition: transitioning ? `transform ${DURATION}ms ease` : "none",
            willChange: "transform",
          }}
        >
          <Outlet />
        </div>
      </div>

      {/* Page position dots — mobile only */}
      <div
        className="sm:hidden fixed left-0 right-0 flex justify-center z-50 pointer-events-none mb-4"
        style={{ bottom: dotsBottom, transition: "bottom 300ms ease-in-out" }}
      >
        <div className="relative flex items-center gap-1.5">
          {ROUTES.map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: ROUTES is static
            <div key={i} className="w-1 h-0.5 bg-purple" />
          ))}
          <div
            ref={dotsIndicatorRef}
            className="absolute w-1 h-0.5 bg-gold left-0 top-0"
            style={{ transform: `translateX(${idx * DOT_STEP}px)` }}
          />
        </div>
      </div>
    </>
  );
}
