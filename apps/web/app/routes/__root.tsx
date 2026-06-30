import { HeadContent, Link, Scripts, createRootRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { BottomNav } from "~/components/BottomNav";
import { BracketLabel } from "~/components/BracketLabel";
import { Header } from "~/components/Header";
import { InAppBrowserBanner } from "~/components/InAppBrowserBanner";
import { OfflineReconciler } from "~/components/OfflineReconciler";
import { PageLayout } from "~/components/PageLayout";
import { ShareModal } from "~/components/ShareModal";
import { SwipeNavigator } from "~/components/SwipeNavigator";
import { TerminalRow } from "~/components/TerminalRow";
import { Body } from "~/components/Text";
import { Toast } from "~/components/Toast";
import { PlaybackErrorToast, Player } from "~/components/player";
import { useStore } from "~/store";
import type { BeforeInstallPromptEvent } from "~/store/uiSlice";
import { safeLocal } from "~/utils/safeStorage";
import "~/styles/global.css";

function RootNotFound() {
  return (
    <PageLayout>
      <div className="flex-1 flex flex-col justify-center">
        <TerminalRow label="status" value={<BracketLabel>404</BracketLabel>} className="mb-4" />
        <h1 className="text-5xl sm:text-7xl font-bold leading-none tracking-tighter mb-6">
          SIGNAL_LOST
        </h1>
        <Body className="mb-10 border-l border-grey/10 pl-4 max-w-sm">
          transmission not found — this frequency doesn't exist
        </Body>
        <Link
          to="/"
          className="inline-flex items-center gap-4 self-start border border-grey/20 px-5 py-3 text-sm text-grey hover:border-purple hover:text-white transition-colors"
        >
          <span className="text-gold">›</span>
          return_to_base
        </Link>
      </div>
    </PageLayout>
  );
}

export const Route = createRootRoute({
  notFoundComponent: RootNotFound,
  head: () => ({
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
      { rel: "preload", href: "/wordmark.png", as: "image", fetchPriority: "high" },
      {
        rel: "preload",
        href: "/fonts/space-mono-400.woff2",
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
      {
        rel: "preload",
        href: "/fonts/space-mono-700.woff2",
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
      {
        rel: "preload",
        href: "/fonts/bedstead-condensed.woff2",
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
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
    ],
  }),
  component: Root,
});

const fontCSS = `
@font-face{font-family:"Space Mono";font-style:normal;font-weight:400;font-display:block;src:url("/fonts/space-mono-400.woff2") format("woff2")}
@font-face{font-family:"Space Mono";font-style:normal;font-weight:700;font-display:block;src:url("/fonts/space-mono-700.woff2") format("woff2")}
@font-face{font-family:"Space Mono";font-style:italic;font-weight:400;font-display:block;src:url("/fonts/space-mono-400-italic.woff2") format("woff2")}
@font-face{font-family:"Bedstead";font-style:normal;font-weight:400;font-display:block;src:url("/fonts/bedstead.woff2") format("woff2")}
@font-face{font-family:"Bedstead Condensed";font-style:normal;font-weight:400;font-display:block;src:url("/fonts/bedstead-condensed.woff2") format("woff2")}
/* Element resets all in @layer base so Tailwind utilities (in @layer utilities)
   always win — utilities cascade in a later layer. Without the layer wrapping,
   unlayered element selectors would beat any utility class regardless of
   specificity, forcing ! on every override. The brand background/font on body
   still applies during the FOUC window because layered rules apply normally
   when no later-layer rule is loaded yet. */
@layer base {
  *,*::before,*::after{box-sizing:border-box}
  html{line-height:1.5;-webkit-text-size-adjust:100%}
  body{margin:0;font-family:"Space Mono",ui-monospace,monospace;background:#161615;color:#fff}
  h1,h2,h3,h4,h5,h6{font-size:inherit;font-weight:inherit;margin:0}
  p{margin:0}
  ul,ol{list-style:none;margin:0;padding:0}
  li{margin:0}
  button,input{font-family:inherit;font-size:inherit}
  img{display:block;max-width:100%}
}
`.trim();

// Triggers persist rehydration after mount so SSR and the first client render
// match exactly (both unhydrated). Without this, the saved track flips in during
// React hydration and causes a visible re-render.
//
// Also stamps `body[data-hydrated="true"]` once the effect runs — Playwright tests
// wait for this marker before clicking interactive elements. Without it, headless
// browsers in CI fire clicks before React attaches event handlers and clicks
// silently no-op (false-positive race).
function HydrateStore() {
  useEffect(() => {
    useStore.persist.rehydrate();
    document.body.dataset.hydrated = "true";
  }, []);
  return null;
}

// Global capture of the two PWA install lifecycle events. Sibling to
// HydrateStore — null render, just runs effects on mount.
//
// Why one listener pair globally (not per-component): both <InstallCta> (home)
// and Phase 3's <SaveForOfflineButton> (/sets/:setId) need the captured
// `beforeinstallprompt` event to call `.prompt()` on. Capturing it twice in
// two components would mean only whichever mounted second sees it — the
// first listener consumed-and-stored it locally. Capturing once into the
// store and reading from both consumers keeps them in sync.
//
// Also performs a one-time migration of Phase 1's localStorage dismiss key
// into the new persisted `pwaInstallDismissed` flag so a returning user who
// said "not now" before isn't re-prompted after this refactor lands.
function InstallEventsListener() {
  const setDeferredPrompt = useStore((s) => s.setDeferredPrompt);
  const setPwaInstalled = useStore((s) => s.setPwaInstalled);
  const setPwaInstallDismissed = useStore((s) => s.setPwaInstallDismissed);

  useEffect(() => {
    // safeLocal handles private-mode Safari / partitioned-iframe throws
    // internally with a silent fallback. If the read throws → returns null →
    // comparison fails → migration skipped. If the remove throws → no-op.
    // Either way no crash, worst case is the user sees the install button
    // once more (the migration just retries on next load and likely succeeds).
    if (safeLocal.get("install-dismissed") === "1") {
      setPwaInstallDismissed(true);
      safeLocal.remove("install-dismissed");
    }

    const onBeforeInstall = (e: Event) => {
      // Chrome would otherwise show its own mini-infobar; we want control.
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setPwaInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [setDeferredPrompt, setPwaInstalled, setPwaInstallDismissed]);

  return null;
}

function Root() {
  return (
    <html lang="en">
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: critical font + reset CSS must be inlined */}
        <style dangerouslySetInnerHTML={{ __html: fontCSS }} suppressHydrationWarning />
        <HeadContent />
      </head>
      <body className="bg-black text-white font-mono antialiased">
        <HydrateStore />
        <InstallEventsListener />
        <OfflineReconciler />
        <Header />
        <SwipeNavigator />
        <Player />
        <PlaybackErrorToast />
        <Toast />
        <ShareModal />
        <InAppBrowserBanner />
        <BottomNav />
        <Scripts />
      </body>
    </html>
  );
}
