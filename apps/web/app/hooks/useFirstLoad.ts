import { useEffect, useState } from "react";

// Module-level flag persists across route changes; resets only on full page reload
let hasLoadedOnce = false;

export function useFirstLoad(): boolean {
  const [isFirstLoad, setIsFirstLoad] = useState(false);

  useEffect(() => {
    // Only apply animation after hydration, on client-side
    if (!hasLoadedOnce) {
      setIsFirstLoad(true);
      hasLoadedOnce = true;
    }
  }, []);

  return isFirstLoad;
}
