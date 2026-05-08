import { useEffect, useState } from "react";

// Module-level flag persists across route changes; resets only on full page reload.
// In development, React StrictMode double-mounts components which sets this flag
// before the visible mount, breaking the animation. We always return true in dev.
const isDev = process.env.NODE_ENV === "development";
let hasLoadedOnce = false;

export function useFirstLoad(): boolean {
  const [isFirstLoad, setIsFirstLoad] = useState(false);

  useEffect(() => {
    if (!hasLoadedOnce) {
      setIsFirstLoad(true);
      hasLoadedOnce = true;
    }
  }, []);

  return isDev || isFirstLoad;
}
