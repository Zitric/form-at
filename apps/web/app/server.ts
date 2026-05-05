import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";

const handler = createStartHandler({ handler: defaultStreamHandler });

export default {
  async fetch(request: Request, env: { DB: D1Database; ASSETS: Fetcher }) {
    const { pathname } = new URL(request.url);
    if (/\.[a-z0-9]+$/i.test(pathname)) {
      return env.ASSETS.fetch(request);
    }
    // biome-ignore lint/suspicious/noExplicitAny: CF env is not in BaseContext type
    return handler(request, { context: { cloudflare: { env } } as any });
  },
};
