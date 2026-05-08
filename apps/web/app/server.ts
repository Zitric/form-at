import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";

const handler = createStartHandler({ handler: defaultStreamHandler });

export default {
  async fetch(request: Request, env: { DB: D1Database; ASSETS: Fetcher } | undefined) {
    const { pathname } = new URL(request.url);

    if (env?.ASSETS && /\.[a-z0-9]+$/i.test(pathname)) {
      return env.ASSETS.fetch(request);
    }

    const safeEnv = env || {};

    // biome-ignore lint/suspicious/noExplicitAny: CF env is not in BaseContext type
    return handler(request, { context: { cloudflare: { env: safeEnv } } as any });
  },
};
