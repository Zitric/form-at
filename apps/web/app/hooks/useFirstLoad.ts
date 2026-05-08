import { useEffect, useState } from "react";

// Track when the very first mount happened to distinguish React StrictMode
// remounts (happen within milliseconds, dev only) from real subsequent mounts
// (happen seconds later via navigation). Both physical mounts of StrictMode's
// logical "first mount" should animate; real subsequent mounts should not.
let firstMountTimestamp: number | null = null;
const STRICT_MODE_REMOUNT_WINDOW_MS = 500;

export function useFirstLoad(): boolean {
  const [isFirstLoad, setIsFirstLoad] = useState(false);

  useEffect(() => {
    const now = Date.now();
    if (firstMountTimestamp === null) {
      firstMountTimestamp = now;
      setIsFirstLoad(true);
    } else if (now - firstMountTimestamp < STRICT_MODE_REMOUNT_WINDOW_MS) {
      setIsFirstLoad(true);
    }
  }, []);

  return isFirstLoad;
}
