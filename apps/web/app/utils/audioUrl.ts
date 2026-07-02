import { APP_CTX_PARAM, APP_CTX_VALUE } from "~/utils/appContext";
import { isStandalone } from "~/utils/installCapability";

// Marks a playback URL with the standalone-context signal the SW handler
// (`sw.ts` audio route) uses to decide whether to consult IDB or fall straight
// through to the network. Tabs send the URL bare → SW pure pass-through, never
// touches IDB, even for a set that IS downloaded in this origin's storage.
// Standalone PWAs append `?ctx=app` → SW strips the marker for the IDB key and
// the network fallback, so cache hits and R2 URLs both match the bare
// canonical form.
//
// Save flow stays bare-URL (this util is NOT called from `startDownload`):
// IDB entries are keyed by the unmarked URL, and the marker is purely a
// playback-time signal. See PWA_PROGRESS.md for the layer-3 rationale.
export function withAppContext(url: string): string {
  if (!isStandalone()) return url;
  try {
    const u = new URL(url);
    u.searchParams.set(APP_CTX_PARAM, APP_CTX_VALUE);
    return u.toString();
  } catch {
    // If URL parsing fails (relative URL, malformed) fall back to the bare
    // string — losing the marker degrades to "tab semantics" (always streams
    // from network), which is the safe default.
    return url;
  }
}

// The inverse (`stripAppContext`, used by the SW audio handler) lives in
// `utils/appContext.ts` — that module must stay worker-safe, and this one
// can't (`isStandalone` needs window).
