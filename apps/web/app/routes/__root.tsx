import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import { Player } from "~/components/Player";
import { PlayerProvider } from "~/contexts/player-context";
import "~/styles/global.css";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#0a0a0a" },
      { title: "Form:at" },
    ],
    links: [{ rel: "manifest", href: "/manifest.json" }],
  }),
  component: Root,
});

function Root() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="bg-[#0a0a0a] text-white antialiased">
        <PlayerProvider>
          <div className="pb-24">
            <Outlet />
          </div>
          <Player />
        </PlayerProvider>
        <Scripts />
      </body>
    </html>
  );
}
