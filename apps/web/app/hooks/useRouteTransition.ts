import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

export function useRouteTransition() {
  const { location } = useRouterState();
  const [isVisible, setIsVisible] = useState(true);
  const previousPathRef = useRef(location.pathname);

  useEffect(() => {
    if (location.pathname !== previousPathRef.current) {
      // Update the ref NOW, not inside the timer. When a second navigation
      // lands within the 500ms window, this effect's cleanup clears the
      // pending timer — with the ref update deferred, the re-run then saw
      // pathname === previousPath, scheduled nothing, and isVisible stayed
      // false FOREVER: content rendered at opacity-0 under visible chrome —
      // the black screen a FullPlayer open_set_details double-nav produces.
      previousPathRef.current = location.pathname;
      // Route changed — fade out
      setIsVisible(false);
      const timer = setTimeout(() => {
        // After fade-out completes, allow new content to mount and fade in
        setIsVisible(true);
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [location.pathname]);

  return isVisible;
}
