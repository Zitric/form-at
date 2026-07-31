import { Button, cn } from "@form-at/ui";

import { useCallback, useEffect, useState } from "react";
import { PushOptInModal } from "~/components/PushOptInModal";
import { useFirstLoad } from "~/hooks/useFirstLoad";
import {
  type PushSubscribeOutcome,
  isPushSupported,
  postSubscription,
} from "~/hooks/usePushSubscription";
import { useSaveGate } from "~/hooks/useSaveGate";
import { useStore, useStoreHydrated } from "~/store";
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
  const setPushOptInDismissed = useStore((s) => s.setPushOptInDismissed);
  const pushOptInDeclinedSession = useStore((s) => s.pushOptInDeclinedSession);
  const setPushOptInDeclinedSession = useStore((s) => s.setPushOptInDeclinedSession);
  const gate = useSaveGate();

  const [permission, setPermission] = useState<NotificationPermission | null>(null);
  const [hasSubscription, setHasSubscription] = useState<boolean | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // The persisted denial flag records a denial OBSERVED at set time — but
  // live permission can change outside the app entirely (Android app
  // settings, Chrome site settings, permission resets). Live state wins:
  // the flag may only suppress the CTA while permission is still "denied";
  // any other live value means it's stale, so clear it and let the normal
  // gating re-offer (granted → the direct-subscribe resume path, default →
  // the full soft prompt). Field bug 2026-07-18: a user who tapped Block,
  // then re-enabled notifications in Android settings, was locked out
  // forever because the flag outranked reality.
  // Read via getState(), not the subscribed value: a flag set mid-session
  // (dismissing the native prompt leaves permission "default") should keep
  // this session's suppression and be reconciled on the NEXT mount.
  useEffect(() => {
    if (!hydrated || !isPushSupported()) return;
    if (Notification.permission !== "denied" && useStore.getState().pushOptInDismissed) {
      setPushOptInDismissed(false);
    }
  }, [hydrated, setPushOptInDismissed]);

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
// fade-in needs to run from this component's actual mount rather than
// racing the gate's own null render.
//
// A CSS keyframe class, not the opacity-state + transition pattern this used
// before (fixed 2026-07-22, field-reported unreliable): that pattern only
// animates if the browser paints the opacity-0 frame before the effect flips
// it to 1. This element mounts LATE — after the permission-read effect, the
// async getSubscription() resolution, and/or the flag-reconcile re-render —
// so insertion and the flip can land in the same paint, and the fade never
// plays. A keyframe class attached at mount always plays, because it doesn't
// depend on a separate prior frame existing.
//
// This does NOT hit BottomNav's keyframe-flash caveat (verified, not just
// cited): that bug is specific to elements present in the SERVER-rendered
// HTML, where attaching an animation only client-side jumps the element from
// its already-painted state back to the keyframe's 0% before replaying —
// the visible double-fade. This component's parent gates on
// `useStoreHydrated()`, whose `getServerSnapshot` (`store/index.ts`) always
// returns `false` — so this subtree is NEVER in the SSR'd HTML. Its first
// appearance in the DOM full stop IS this mount, so there's no prior painted
// state to jump from; the keyframe's 0%→100% is the truthful first frame.
//
// Same first-load timing convention as every other home-page entrance (5s
// true first paint, 0.6s otherwise) — `animate-slow-fade-in` and
// `animate-fade-in` share the same `fade-in` keyframe, just a different
// theme-level duration (`global.css`).
function PushOptInCtaButton({ className, onOpen }: { className?: string; onOpen: () => void }) {
  const isFirstLoad = useFirstLoad();

  return (
    <div className={isFirstLoad ? "animate-slow-fade-in" : "animate-fade-in"}>
      <Button variant="secondary" onClick={onOpen} className={cn(className)}>
        notify_me
      </Button>
    </div>
  );
}
