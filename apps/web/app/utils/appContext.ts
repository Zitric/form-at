// The `?ctx=app` marker protocol shared by the page and the service worker.
//
// This module is deliberately worker-safe: no window, no navigator, no React
// — `sw.ts` type-checks against WebWorker libs (tsconfig.sw.json) and imports
// `stripAppContext` from here. The page-side half of the protocol
// (`withAppContext`, which needs `isStandalone()` and therefore `window`)
// lives in `utils/audioUrl.ts` and imports the constants below so the two
// halves can't drift.

export const APP_CTX_PARAM = "ctx";
export const APP_CTX_VALUE = "app";

// Inverse of `withAppContext`, used by the SW audio handler: detects the
// standalone marker and produces the bare canonical URL that keys IDB
// entries (the download flow stores bare URLs — see `startDownload`).
// `searchParams.delete` + `toString()` emits no trailing `?` when the
// search becomes empty, so the result matches `sets.ts` src strings exactly.
export function stripAppContext(url: URL): { ctxIsApp: boolean; bareUrl: string } {
  const ctxIsApp = url.searchParams.get(APP_CTX_PARAM) === APP_CTX_VALUE;
  if (!ctxIsApp) return { ctxIsApp, bareUrl: url.toString() };
  const bare = new URL(url.toString());
  bare.searchParams.delete(APP_CTX_PARAM);
  return { ctxIsApp, bareUrl: bare.toString() };
}
