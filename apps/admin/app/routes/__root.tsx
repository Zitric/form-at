import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/react-router";
import "~/styles/global.css";

export const Route = createRootRoute({
  head: () => ({
    meta: [{ title: "Form:at Admin" }, { name: "robots", content: "noindex" }],
  }),
  component: Root,
});

function Root() {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="bg-black text-white font-mono antialiased min-h-dvh flex flex-col">
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
