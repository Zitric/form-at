import { useEffect } from "react";

// Tracks which typewriter blocks have already played in this client session.
// Module-level so it survives unmount/remount across client-side navigations,
// but resets on full page reload (the JS bundle re-evaluates).
const seen = new Set<string>();

// Returns true on the first call per `key` in this session, false afterwards.
// Used by routes that gate the ConsoleWriter typewriter — first visit animates,
// subsequent visits render the text statically without retyping.
export function useTypedOnce(key: string): boolean {
  const isFirstLoading = !seen.has(key);
  useEffect(() => {
    seen.add(key);
  }, [key]);
  return isFirstLoading;
}
