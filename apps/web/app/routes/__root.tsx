import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { Player } from "~/components/Player";
import { PlayerProvider } from "~/contexts/player-context";
import "~/styles/global.css";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#080812" },
      { title: "Form:at" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Space+Mono:ital,wght@0,400;0,700;1,400&display=swap",
      },
      { rel: "manifest", href: "/manifest.json" },
    ],
  }),
  component: Root,
});

function Root() {
  return (
    <html lang="en">
      <head>
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
