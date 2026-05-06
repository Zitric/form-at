import { HeadContent, Link, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { Header } from "~/components/Header";
import { Player } from "~/components/Player";
import { PlayerProvider } from "~/contexts/player-context";
import "~/styles/global.css";

function RootNotFound() {
  return (
    <main className="min-h-dvh flex flex-col px-6 py-10 font-mono max-w-2xl mx-auto w-full">
      <Header />

      <div className="flex-1 flex flex-col justify-center">
        <p className="text-xs text-white/30 mb-4">
          <span className="text-gold mr-2">›</span>status: [ 404 ]
        </p>
        <h1 className="text-5xl sm:text-7xl font-bold leading-none tracking-tighter mb-6">
          SIGNAL_LOST
        </h1>
        <p className="text-sm text-white/40 mb-10 border-l border-white/10 pl-4 max-w-sm">
          transmission not found — this frequency doesn't exist
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-4 self-start border border-white/20 px-5 py-3 text-sm text-white/60 hover:border-gold hover:text-gold transition-colors"
        >
          <span className="text-gold">›</span>
          return_to_base
        </Link>
      </div>

      <footer className="mt-12 text-xs text-white/20">[ end_of_transmission ] █</footer>
    </main>
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
      { property: "og:image", content: "https://form-at-web.pages.dev/icon-512.png" },
      { property: "og:image:width", content: "512" },
      { property: "og:image:height", content: "512" },
      { property: "og:image:alt", content: "Form:at logo" },
      { property: "og:url", content: "https://form-at-web.pages.dev" },
      { property: "og:locale", content: "en_GB" },

      // Twitter / X
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Form:at" },
      {
        name: "twitter:description",
        content: "Glasgow techno collective. Analog soul in a digital world.",
      },
      { name: "twitter:image", content: "https://form-at-web.pages.dev/icon-512.png" },
      { name: "twitter:image:alt", content: "Form:at logo" },

      // iOS — fullscreen PWA behaviour when launched from home screen
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Form:at" },

      // Android
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "theme-color", content: "#080812" },

      // Windows
      { name: "msapplication-TileColor", content: "#080812" },
      { name: "msapplication-TileImage", content: "/icon-192.png" },
      { name: "msapplication-navbutton-color", content: "#c8921a" },
    ],
    links: [
      { rel: "icon", href: "/logo.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
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
*,*::before,*::after{box-sizing:border-box}
html{line-height:1.5;-webkit-text-size-adjust:100%}
body{margin:0;font-family:"Space Mono",ui-monospace,monospace;background:#080812;color:#fff}
h1,h2,h3,h4,h5,h6{font-size:inherit;font-weight:inherit;margin:0}
p{margin:0}
ul,ol{list-style:none;margin:0;padding:0}
li{margin:0}
button,input{font-family:inherit;font-size:inherit}
img{display:block;max-width:100%}
`.trim();

function Root() {
  return (
    <html lang="en">
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: font CSS must be inlined to block FOUT; suppressHydrationWarning prevents React from touching it during hydration */}
        <style dangerouslySetInnerHTML={{ __html: fontCSS }} suppressHydrationWarning />
        <HeadContent />
      </head>
      <body className="bg-navy text-white font-mono antialiased">
        <PlayerProvider>
          <div className="pb-20">
            <Outlet />
          </div>
          <Player />
        </PlayerProvider>
        <Scripts />
      </body>
    </html>
  );
}
