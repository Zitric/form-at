import { HeadContent, Link, Scripts, createRootRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { BottomNav } from "~/components/BottomNav";
import { Header } from "~/components/Header";
import { PageLayout } from "~/components/PageLayout";
import { Player } from "~/components/Player";
import { SwipeNavigator } from "~/components/SwipeNavigator";
import { TerminalRow } from "~/components/TerminalRow";
import { Body } from "~/components/Text";
import { useStore } from "~/store";
import "~/styles/global.css";

function RootNotFound() {
  return (
    <PageLayout footer="[ end_of_transmission ]">
      <div className="flex-1 flex flex-col justify-center">
        <TerminalRow label="status" value="[ 404 ]" className="mb-4" />
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
      { name: "viewport", content: "width=device-width, initial-scale=1" },
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
      { property: "og:image", content: "https://formatglasgow.com/icon-512.png" },
      { property: "og:image:width", content: "512" },
      { property: "og:image:height", content: "512" },
      { property: "og:image:alt", content: "Form:at logo" },
      { property: "og:url", content: "https://formatglasgow.com" },
      { property: "og:locale", content: "en_GB" },

      // Twitter / X
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Form:at" },
      {
        name: "twitter:description",
        content: "Glasgow techno collective. Analog soul in a digital world.",
      },
      { name: "twitter:image", content: "https://formatglasgow.com/icon-512.png" },
      { name: "twitter:image:alt", content: "Form:at logo" },

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
function HydrateStore() {
  useEffect(() => {
    useStore.persist.rehydrate();
  }, []);
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
        <Header />
        <SwipeNavigator />
        <Player />
        <BottomNav />
        <Scripts />
      </body>
    </html>
  );
}
