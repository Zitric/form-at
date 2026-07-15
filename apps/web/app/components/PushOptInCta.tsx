import { useEffect, useState } from "react";
import { Button } from "~/components/Button";
import { useFirstLoad } from "~/hooks/useFirstLoad";
import { isPushSupported, useSubscribeToPush } from "~/hooks/usePushSubscription";
import { useStore, useStoreHydrated } from "~/store";
import { cn } from "~/utils/cn";

// Push-notification opt-in CTA — home route, stacked directly below
// <InstallCta> in the same passive-nudge zone (see routes/index.tsx).
//
// A SEPARATE component rather than folded into InstallCta: installing the
// app and opting into push are different asks with different capability
// checks (`beforeinstallprompt` vs `PushManager` presence) and different
// native prompts. Conflating them would mean dismissing one silently
// answers a question the user was never actually asked — the exact
// reasoning `pushOptInDismissed` being its own flag already documents in
// uiSlice.ts.
//
// Gate order mirrors InstallCta: hydrated (persisted dismiss flag known) →
// capability present → not already dismissed → permission still "default"
// (nothing to offer once granted — Phase 2 has no "you're subscribed"
// confirmation UI, a documented gap — or once denied, since the browser
// itself blocks re-prompting at that point anyway).
//
// `Notification.permission` is read in an effect, not at render/module
// scope — it's a browser-only global with no SSR equivalent; reading it
// during render would desync SSR output from the first client render.
export function PushOptInCta({ className }: { className?: string }) {
  const hydrated = useStoreHydrated();
  const pushOptInDismissed = useStore((s) => s.pushOptInDismissed);
  const subscribe = useSubscribeToPush();
  const [permission, setPermission] = useState<NotificationPermission | null>(null);

  useEffect(() => {
    if (isPushSupported()) setPermission(Notification.permission);
  }, []);

  // Owned by the parent (not the button child) so the permission re-read
  // lands on the state that gates rendering: a successful subscribe flips
  // `Notification.permission` to "granted" and the CTA hides THIS session,
  // not just on the next mount. A "failed" outcome leaves permission at
  // "granted" too (the grant succeeded, the subscribe after it didn't) —
  // acceptable: the browser-level ask is spent either way, and re-showing
  // a button whose tap can no longer trigger a prompt would be a dead nudge.
  // "denied" hides via the pushOptInDismissed flag the hook already set.
  const handleOptIn = async () => {
    await subscribe();
    if (isPushSupported()) setPermission(Notification.permission);
  };

  if (!hydrated || pushOptInDismissed || permission !== "default") return null;

  return <PushOptInCtaButton className={className} onOptIn={handleOptIn} />;
}

// Split for the same reason InstallCtaButton is split from InstallCta: the
// gate above renders null until capability + permission are known, so the
// fade-in hooks need to run from this component's actual mount rather than
// racing the gate's own null render. Same first-load timing convention as
// every other home-page entrance (5s true first paint, 0.6s otherwise).
function PushOptInCtaButton({
  className,
  onOptIn,
}: {
  className?: string;
  onOptIn: () => Promise<void>;
}) {
  const isFirstLoad = useFirstLoad();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(true);
  }, []);
  const fadeDuration = isFirstLoad ? "5s" : "0.6s";

  return (
    <div style={{ opacity: visible ? 1 : 0, transition: `opacity ${fadeDuration} ease-out` }}>
      <Button variant="secondary" onClick={() => void onOptIn()} className={cn(className)}>
        notify_me
      </Button>
    </div>
  );
}
