import { useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

export function useRouteTransition() {
  const { location } = useRouterState();
  const [isVisible, setIsVisible] = useState(true);
  const previousPathRef = useRef(location.pathname);

  useEffect(() => {
    if (location.pathname !== previousPathRef.current) {
      // Route changed — fade out
      setIsVisible(false);
      const timer = setTimeout(() => {
        // After fade-out completes, allow new content to mount and fade in
        setIsVisible(true);
        previousPathRef.current = location.pathname;
      }, 500);

      return () => clearTimeout(timer);
    }
  }, [location.pathname]);

  return isVisible;
}
