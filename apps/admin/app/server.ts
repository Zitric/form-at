import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import { isAllowedHost } from "~/utils/hostGuard";

const handler = createStartHandler({ handler: defaultStreamHandler });

// Document CSP — mirrors apps/web/app/server.ts's rationale, minus the
// audio-host allowances (this app never streams audio). Cloudflare Pages'
// `_headers` file applies to static assets only, so SSR documents need this
// set on the response here instead.
const DOCUMENT_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
].join("; ");

export default {
  async fetch(request: Request, env: { DB: D1Database; ASSETS: Fetcher } | undefined) {
    const { hostname, pathname } = new URL(request.url);

    // First check, before routing or D1 access — see hostGuard.ts for why
    // this exists. Plain 404, not a redirect, so we don't advertise the
    // real hostname to whatever hit the wrong one.
    if (!isAllowedHost(hostname)) {
      return new Response(null, { status: 404 });
    }

    if (env?.ASSETS && /\.[a-z0-9]+$/i.test(pathname)) {
      return env.ASSETS.fetch(request);
    }

    const safeEnv = env || {};

    // biome-ignore lint/suspicious/noExplicitAny: CF env is not in BaseContext type
    const response = await handler(request, { context: { cloudflare: { env: safeEnv } } as any });

    if (response.headers.get("content-type")?.includes("text/html")) {
      const withCsp = new Response(response.body, response);
      withCsp.headers.set("Content-Security-Policy", DOCUMENT_CSP);
      return withCsp;
    }
    return response;
  },
};
