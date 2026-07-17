import { useCallback, useEffect, useState } from "react";
import { Button } from "~/components/Button";
import { PushOptInModal } from "~/components/PushOptInModal";
import { useFirstLoad } from "~/hooks/useFirstLoad";
import {
  type PushSubscribeOutcome,
  isPushSupported,
  postSubscription,
} from "~/hooks/usePushSubscription";
import { useSaveGate } from "~/hooks/useSaveGate";
import { useStore, useStoreHydrated } from "~/store";
import { cn } from "~/utils/cn";
import { isStandalone } from "~/utils/installCapability";

// Push-notification opt-in CTA — home route, stacked directly below
// <InstallCta> in the same passive-nudge zone (see routes/index.tsx).
// Tapping it opens <PushOptInModal> (the soft prompt); the native permission
// dialog NEVER fires from this component — only from the modal's accept
// action, and only in the standalone variant.
//
// Renders in BOTH display modes, with different asks behind the tap:
//   standalone — the real subscribe offer. Requires the Push API and an
//     unspent ask: permission "default", OR "granted" with no live
//     subscription (a previous subscribe failed after the grant — the modal
//     can retry without re-prompting, so the CTA must come back).
//   browser tab — the install nudge (subscriptions are app-only product
//     policy; the tab variant converts notification interest into installs).
//     Shown even where the Push API is absent (iOS Safari tabs — installing
//     IS the fix there); hidden once permission is known-spent at this
//     origin ("granted" means they've been through the app flow, "denied"
//     means notifications are a dead end nobody should be nudged toward).
//
// Suppression tiers: `pushOptInDismissed` (persisted — a spent native ask)
// and `pushOptInDeclinedSession` (this session only — declined the soft
// prompt; see uiSlice.ts for why declines are deliberately not persisted).
//
// `Notification.permission` is read in an effect, not at render/module
// scope — it's a browser-only global with no SSR equivalent; reading it
// during render would desync SSR output from the first client render.
export function PushOptInCta({ className }: { className?: string }) {
  const hydrated = useStoreHydrated();
  const pushOptInDismissed = useStore((s) => s.pushOptInDismissed);
  const pushOptInDeclinedSession = useStore((s) => s.pushOptInDeclinedSession);
  const setPushOptInDeclinedSession = useStore((s) => s.setPushOptInDeclinedSession);
  const gate = useSaveGate();

  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [hasSubscription, setHasSubscription] = useState<boolean | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!isPushSupported()) return;
    setPermission(Notification.permission);
    if (Notification.permission !== "granted") return;
    // Granted but possibly unsubscribed (a subscribe that failed after the
    // grant, some earlier session). `getSubscription()` settles whether the
    // CTA still has something to offer. Fails closed — an errored check
    // reads as "subscribed" so we never show a nudge we can't back up.
    let cancelled = false;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (cancelled) return;
        setHasSubscription(subscription !== null);
        // Reconcile: a local subscription can exist with NO server row —
        // the field case was a device that subscribed before the
        // push_subscriptions migration was applied (subscribe succeeded at
        // the push service, the POST hit a missing table). The CTA hides
        // on it, so without this re-POST the device would silently never
        // receive a send again. Idempotent (INSERT OR REPLACE on
        // endpoint). Standalone-only: a tab can share the origin's
        // subscription, and re-POSTing from there would flip the row's
        // is_standalone.
        if (subscription && isStandalone()) postSubscription(subscription);
      })
      .catch(() => {
        if (!cancelled) setHasSubscription(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!hydrated) return null;

  const suppressed = pushOptInDismissed || pushOptInDeclinedSession;
  const grantedButUnsubscribed = permission === "granted" && hasSubscription === false;
  const standaloneOfferable = permission === "default" || grantedButUnsubscribed;
  // In a tab, `permission === null` means the Push API is absent here (iOS
  // Safari tab) — exactly the audience the install nudge exists for.
  const tabOfferable = permission === null || permission === "default";
  const showCta = !suppressed && (gate.allow === true ? standaloneOfferable : tabOfferable);

  // Stable (useCallback) because the modal folds this into `applyOutcome`,
  // which its open-effect depends on — an unstable identity would re-fire
  // that effect on every render here and re-run the resume subscribe.
  const handleOutcome = useCallback((outcome: PushSubscribeOutcome) => {
    if (isPushSupported()) setPermission(Notification.permission);
    if (outcome === "subscribed") setHasSubscription(true);
  }, []);

  // The modal is a SIBLING of the gated button, not inside it — a subscribe
  // or decline flips `showCta` false while the modal is still open (success
  // copy showing, exit animation running), and unmounting it at that moment
  // would cut both off.
  return (
    <>
      {showCta && <PushOptInCtaButton className={className} onOpen={() => setModalOpen(true)} />}
      <PushOptInModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onDeclined={() => setPushOptInDeclinedSession(true)}
        onOutcome={handleOutcome}
        gate={gate}
      />
    </>
  );
}

// Split for the same reason InstallCtaButton is split from InstallCta: the
// gate above renders null until capability + permission are known, so the
// fade-in hooks need to run from this component's actual mount rather than
// racing the gate's own null render. Same first-load timing convention as
// every other home-page entrance (5s true first paint, 0.6s otherwise).
function PushOptInCtaButton({ className, onOpen }: { className?: string; onOpen: () => void }) {
  const isFirstLoad = useFirstLoad();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(true);
  }, []);
  const fadeDuration = isFirstLoad ? "5s" : "0.6s";

  return (
    <div style={{ opacity: visible ? 1 : 0, transition: `opacity ${fadeDuration} ease-out` }}>
      <Button variant="secondary" onClick={onOpen} className={cn(className)}>
        notify_me
      </Button>
    </div>
  );
}
