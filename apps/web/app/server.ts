import { AUDIO_ORIGIN } from "@form-at/data/sets";
import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";

const handler = createStartHandler({ handler: defaultStreamHandler });

// Document CSP (M3, 2026-07-02 review). Cloudflare Pages' `_headers` file
// applies to STATIC ASSETS only — responses generated here (all SSR
// documents) don't get it, so the document policy is set on the response
// below. Keep in sync with the `/*` rule in `public/_headers` (which covers
// offline.html, the one static document).
//
// Why each non-'self' allowance exists:
//   script-src 'unsafe-inline' — the inline SW-registration + beforeinstall-
//     prompt stash scripts in __root's head, plus TanStack Start's SSR
//     hydration payload scripts (dynamic per request — unhashable).
//   style-src 'unsafe-inline'  — the inlined critical font CSS + React
//     style attributes.
//   img-src data:              — favicon/data URIs.
//   media-src / connect-src — the <audio> stream and the peaks-JSON /
//     download fetches from the audio host (see @form-at/data/sets, the
//     canonical home of the hostname).
const DOCUMENT_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  `media-src 'self' ${AUDIO_ORIGIN}`,
  `connect-src 'self' ${AUDIO_ORIGIN}`,
  "worker-src 'self'",
  "manifest-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
].join("; ");

export default {
  async fetch(request: Request, env: { DB: D1Database; ASSETS: Fetcher } | undefined) {
    const { pathname } = new URL(request.url);

    if (env?.ASSETS && /\.[a-z0-9]+$/i.test(pathname)) {
      return env.ASSETS.fetch(request);
    }

    const safeEnv = env || {};

    // biome-ignore lint/suspicious/noExplicitAny: CF env is not in BaseContext type
    const response = await handler(request, { context: { cloudflare: { env: safeEnv } } as any });

    // Attach the CSP to documents only — API/server-fn responses don't need
    // it and some are consumed by code that a policy header could confuse.
    if (response.headers.get("content-type")?.includes("text/html")) {
      const withCsp = new Response(response.body, response);
      withCsp.headers.set("Content-Security-Policy", DOCUMENT_CSP);
      return withCsp;
    }
    return response;
  },
};
