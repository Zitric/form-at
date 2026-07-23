// The site-wide default `<head>` config — meta/links/scripts that apply to
// every route unless a page's own `head()` overrides them (see `pageHead()`
// in this same directory for the per-route builder this feeds into).
export function rootHead() {
  return {
    meta: [
      { charSet: "utf-8" },
      // `viewport-fit=cover` lets `env(safe-area-inset-*)` resolve to real
      // values on iOS, which we already rely on for BottomNav padding +
      // FullPlayer header. Also a prerequisite for the Phase 4.5 PWA-mode
      // Dynamic Island layout — without `cover`, iOS clamps the page width
      // to the safe area and the standalone header can't reach the edges.
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "author", content: "Form:at" },
      { title: "Form:at" },
      {
        name: "description",
        content: "Glasgow techno collective. Analog soul in a digital world.",
      },

      // Open Graph — covers Facebook, Instagram, WhatsApp, Discord, Telegram, Slack, LinkedIn
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Form:at" },
      { property: "og:title", content: "Form:at" },
      {
        property: "og:description",
        content: "Glasgow techno collective. Analog soul in a digital world.",
      },
      { property: "og:image", content: "https://formatglasgow.com/og-image.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "FORM:AT — analog soul in a digital world" },
      { property: "og:url", content: "https://formatglasgow.com" },
      { property: "og:locale", content: "en_GB" },

      // Twitter / X — large card to match the 1200×630 banner
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Form:at" },
      {
        name: "twitter:description",
        content: "Glasgow techno collective. Analog soul in a digital world.",
      },
      { name: "twitter:image", content: "https://formatglasgow.com/og-image.png" },
      { name: "twitter:image:alt", content: "FORM:AT — analog soul in a digital world" },

      // iOS — fullscreen PWA behaviour when launched from home screen
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Form:at" },

      // Android
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "theme-color", content: "#161615" },

      // Windows
      { name: "msapplication-TileColor", content: "#161615" },
      { name: "msapplication-TileImage", content: "/icon-192.png" },
      { name: "msapplication-navbutton-color", content: "#c8921a" },
    ],
    links: [
      { rel: "icon", href: "/logo.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
      { rel: "preload", href: "/wordmark.png", as: "image", fetchPriority: "high" as const },
      {
        rel: "preload",
        href: "/fonts/space-mono-400.woff2",
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous" as const,
      },
      {
        rel: "preload",
        href: "/fonts/space-mono-700.woff2",
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous" as const,
      },
      {
        rel: "preload",
        href: "/fonts/bedstead-condensed.woff2",
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous" as const,
      },
      { rel: "manifest", href: "/manifest.json" },
    ],
    scripts: [
      // Cloudflare Web Analytics — replace token after adding site in CF dashboard → Web Analytics
      // { src: "https://static.cloudflareinsights.com/beacon.min.js", defer: true, "data-cf-beacon": '{"token":"REPLACE_WITH_YOUR_TOKEN"}' },
      // Service worker registration. Inline rather than external because the
      // file is tiny and we don't want a second round-trip on every cold
      // start just to fetch a 4-line snippet. Classic worker (no
      // `{ type: "module" }`) — matches the iife build in vite.config.ts and
      // keeps Safari < 15.4 compatible. Errors land in the console so a
      // misdeployed `/sw.js` is loud rather than silent.
      {
        children: `if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .catch((err) => console.warn('[sw] registration failed:', err));
  });
}`,
      },
      // Pre-hydration capture of `beforeinstallprompt`. Chromium fires it
      // once per page load, often while first-visit JS is still downloading —
      // a React-effect listener misses it and the install CTA never appears
      // that session. This inline script runs before any bundle; the React
      // layer adopts the stash on mount (see utils/installPromptStash.ts,
      // which owns the property name — keep the two in sync).
      {
        children: `window.__deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  window.__deferredInstallPrompt = e;
});`,
      },
    ],
  };
}
