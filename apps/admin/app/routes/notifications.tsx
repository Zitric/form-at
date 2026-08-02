import { PageTitle } from "@form-at/ui";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { RecentPushSends } from "~/components/RecentPushSends";
import { SendPushForm } from "~/components/SendPushForm";
import { fetchNotificationsPageData } from "~/data/push-sends";

export const Route = createFileRoute("/notifications")({
  loader: () => fetchNotificationsPageData(),
  head: () => ({ meta: [{ title: "Notifications · Form:at Admin" }] }),
  component: NotificationsPage,
});

// The first mutating admin page — see routes/api/send-push.ts for the
// endpoint and its Access-JWT verification. This component itself has no
// auth logic (same "Access gates the page load" pattern as dashboard.tsx);
// it owns the subscriber-count display, the recent-sends list (visible
// before the form so an accidental duplicate is caught before it happens),
// and the send form + confirm flow.
function NotificationsPage() {
  const data = Route.useLoaderData();
  const router = useRouter();

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <PageTitle>notifications</PageTitle>
      <p className="t-body sm:t-body-md text-grey">
        reaches <span className="text-white">{data.subscriberCount}</span>{" "}
        {data.subscriberCount === 1 ? "subscriber" : "subscribers"}
      </p>
      <RecentPushSends sends={data.recentSends} />
      <SendPushForm
        subscriberCount={data.subscriberCount}
        onSent={() => {
          // Reloads this route's loader — refreshes both the subscriber
          // count (a send can remove dead subscriptions) and the
          // recent-sends list (so the just-sent one appears immediately,
          // without a second query the client would have to construct).
          router.invalidate();
        }}
      />
    </div>
  );
}
