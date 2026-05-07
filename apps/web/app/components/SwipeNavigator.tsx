import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useDrag } from "@use-gesture/react";
import { useRef, useState } from "react";

const ROUTES = ["/", "/sets", "/events", "/djs"] as const;
const SWIPE_PX = 80;
const SWIPE_VX = 0.5;
const DURATION = 220;

function routeIndex(pathname: string): number {
  return ROUTES.findIndex((r) => (r === "/" ? pathname === "/" : pathname.startsWith(r)));
}

export function SwipeNavigator() {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [offset, setOffset] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const busy = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const idx = routeIndex(pathname);

  const bind = useDrag(
    ({ movement: [mx], last, velocity: [vx], direction: [dx] }) => {
      if (busy.current) return;

      if (!last) {
        const atStart = idx === 0 && mx > 0;
        const atEnd = idx === ROUTES.length - 1 && mx < 0;
        setOffset(atStart || atEnd ? mx * 0.15 : mx);
        return;
      }

      const swiped = Math.abs(mx) > SWIPE_PX || Math.abs(vx) > SWIPE_VX;
      const goingLeft = dx < 0;
      const next = goingLeft ? idx + 1 : idx - 1;

      if (swiped && next >= 0 && next < ROUTES.length) {
        busy.current = true;

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
        navigate({ to: ROUTES[next] });
        setTransitioning(false);
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
        setTransitioning(true);
        setOffset(0);
        setTimeout(() => setTransitioning(false), DURATION);
      }
    },
    { axis: "x", filterTaps: true },
  );

  return (
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
  );
}
