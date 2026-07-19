import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "~/components/Button";
import { IosInstallSteps, ManualInstallHint } from "~/components/InstallInstructions";
import { Modal } from "~/components/Modal";
import { TextButton } from "~/components/TextButton";
import {
  type PushSubscribeOutcome,
  isPushSupported,
  useSubscribeToPush,
} from "~/hooks/usePushSubscription";
import { type SaveGate, useTriggerInstallPrompt } from "~/hooks/useSaveGate";
import { useTrackEvent } from "~/hooks/useTrackEvent";
import { useStore } from "~/store";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Fired when the modal is closed without the user accepting either ask
   *  (no notify_accepted, no install tap) — the parent suppresses the CTA
   *  for the session. NOT fired after an accept, even a failed one: a
   *  failed subscribe must leave the CTA retryable. */
  onDeclined: () => void;
  /** Fired with the subscribe result so the parent can re-read
   *  `Notification.permission` / subscription state and re-gate the CTA. */
  onOutcome: (outcome: PushSubscribeOutcome) => void;
  gate: SaveGate;
};

// Local UI phases for the standalone (subscribe) variant. "denied" and
// "failed" are DISTINCT states because their user-side fixes differ:
// denied is a spent native prompt (only device settings can undo it —
// transparency, no dead retry button), failed is a transient subscribe
// error after a successful grant (retry is legitimate and cheap, since
// `Notification.requestPermission()` resolves instantly once granted).
type SubscribePhase = "idle" | "busy" | "subscribed" | "denied" | "failed";

// Soft-prompt modal behind the home page's `notify_me` CTA — the
// pre-permission pattern: the native browser permission dialog must NOT
// fire until the user accepts THIS modal. A native "Block" is nearly
// unrecoverable (the browser refuses to re-prompt); our own "not now"
// stays recoverable. Two variants, branched on the same `SaveGate` the
// save-for-offline flow uses:
//
//   gate.allow === true (standalone app) — the real subscribe ask. Accept →
//     `useSubscribeToPush()` (which owns the native permission request +
//     subscribe + POST). Decline → close, session-only CTA suppression.
//     When permission is ALREADY granted (granted-but-unsubscribed — a
//     subscribe that failed after its grant), there's no ask to make: the
//     modal skips the prompt and resumes the subscribe directly on open.
//
//   any browser-tab reason — NO subscription is possible here, by design:
//     push subscriptions are app-only product policy, so the tab variant
//     converts notification interest into installs instead of losing it.
//     needs-install reuses the exact install mechanics SaveGateModal uses
//     (native prompt via useTriggerInstallPrompt, or the hedged manual
//     copy); open-app / cannot-install get honest guidance. The
//     `Notification` API is never touched on any tab path.
//
// The gate.pending branch renders nothing — the parent CTA is hydration-
// gated, so the modal can't be opened before the gate is known.
export function PushOptInModal({ open, onClose, onDeclined, onOutcome, gate }: Props) {
  const subscribe = useSubscribeToPush();
  const triggerInstall = useTriggerInstallPrompt();
  const setPwaInstalled = useStore((s) => s.setPwaInstalled);
  const trackEvent = useTrackEvent();

  const [phase, setPhase] = useState<SubscribePhase>("idle");
  // Tracks whether the user accepted an ask during THIS open — read at close
  // time to decide decline semantics. A ref, not state: it never drives
  // rendering, and the close handler needs the current value synchronously.
  const engagedRef = useRef(false);

  const isSubscribeVariant = gate.allow === true;

  // Stable (useCallback) because the open-effect below depends on it — an
  // unstable identity would re-fire the effect mid-open and re-run the
  // resume subscribe on every parent render.
  const applyOutcome = useCallback(
    (outcome: PushSubscribeOutcome) => {
      onOutcome(outcome);
      if (outcome === "subscribed") setPhase("subscribed");
      else if (outcome === "denied") setPhase("denied");
      // "failed" and "unsupported" both land here; "unsupported" is unreachable
      // in practice (the CTA only offers this variant when isPushSupported()).
      else setPhase("failed");
    },
    [onOutcome],
  );

  useEffect(() => {
    if (!open) return;
    engagedRef.current = false;
    // Resume path: permission was granted in an earlier session but no
    // subscription survived (the subscribe after the grant failed). There
    // is no ask left to make and no native prompt that could fire, so the
    // soft prompt would be noise — subscribe directly instead.
    // `Notification.permission` is read HERE, not taken as a prop or dep:
    // a prop would flip mid-open when a normal accept lands its grant, and
    // this effect re-firing on that flip would subscribe a second time.
    // Engaged from the start — closing a failed resume is not a decline
    // (the CTA must stay retryable) — and no notify_* events fire: the
    // funnel measures the soft prompt, and this path never shows one.
    if (isSubscribeVariant && isPushSupported() && Notification.permission === "granted") {
      engagedRef.current = true;
      setPhase("busy");
      void subscribe().then(applyOutcome);
      return;
    }
    setPhase("idle");
    trackEvent(isSubscribeVariant ? "notify_prompt_shown" : "notify_install_nudge_shown");
  }, [open, isSubscribeVariant, subscribe, applyOutcome, trackEvent]);

  const handleClose = () => {
    if (!engagedRef.current) {
      trackEvent("notify_declined");
      onDeclined();
    }
    onClose();
  };

  const handleAccept = async () => {
    engagedRef.current = true;
    trackEvent("notify_accepted");
    setPhase("busy");
    applyOutcome(await subscribe());
  };

  const handleNativeInstall = async () => {
    engagedRef.current = true;
    const outcome = await triggerInstall();
    if (outcome !== "no-prompt") onClose();
  };

  // Same mutual escape-hatch pair as SaveGateModal, same no-close rule: the
  // `pwaInstalled` flip changes `gate` in the parent, which re-renders THIS
  // modal with the other branch's copy in place — closing on top of that
  // would hide the correction the user just asked for.
  const handleAlreadyInstalled = () => setPwaInstalled(true);
  const handleNotInstalledAfterAll = () => setPwaInstalled(false);

  const subscribeBody =
    phase === "subscribed" ? (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-white leading-relaxed">notifications on.</p>
        <p className="text-sm text-grey leading-relaxed">
          we'll ping you when something new drops — no spam, just the signal.
        </p>
        <Button variant="secondary" onClick={handleClose} className="text-left">
          done
        </Button>
      </div>
    ) : phase === "denied" ? (
      <p className="text-sm text-grey leading-relaxed">
        notifications are blocked for Form:at at the browser level. if you change your mind, allow
        notifications for <span className="text-white">formatglasgow.com</span> in your device
        settings — we can't re-ask from here.
      </p>
    ) : phase === "busy" ? (
      // Neutral enough for both routes into busy: the normal accept (where
      // the native prompt may be up) and the resume path (where it never is).
      <p className="text-sm text-grey leading-relaxed">setting up notifications…</p>
    ) : phase === "failed" ? (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-grey leading-relaxed">
          something went wrong subscribing — usually a network hiccup. your permission is granted;
          trying again won't re-prompt.
        </p>
        <Button variant="secondary" onClick={() => void handleAccept()} className="text-left">
          try_again
        </Button>
        <TextButton onClick={handleClose}>not now</TextButton>
      </div>
    ) : (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-grey leading-relaxed">
          hear about new sets, events and line-ups before anyone else — a short ping when something
          drops, nothing else.
        </p>
        <p className="text-xs text-grey/70 leading-relaxed">
          your browser will ask to confirm — that part's one tap.
        </p>
        <Button variant="secondary" onClick={() => void handleAccept()} className="text-left">
          enable_notifications
        </Button>
        <TextButton onClick={handleClose}>not now</TextButton>
      </div>
    );

  return (
    <Modal
      open={open}
      onClose={handleClose}
      ariaLabel="Form:at — get notified about new sets and events"
      title={
        <div className="text-xs text-grey tracking-widest truncate">
          › <span className="text-white">notify_me</span>
        </div>
      }
    >
      {/* Phase transitions must read as ONE modal changing state, not a
          chain of modals (field bug 2026-07-19): the <dialog> is centered
          with `inset-0 m-auto h-fit`, so any body-height change resizes AND
          recenters it — with the OS permission sheet interleaved between
          the ask and the outcome, the jump read as a second modal. min-h
          pins the geometry near the tallest phase (the idle ask) so busy/
          success/denied hold the same footprint, and the keyed fade makes
          the content swap an explicit in-place transition. */}
      {isSubscribeVariant && (
        <div key={phase} className="animate-fade-in min-h-48">
          {subscribeBody}
        </div>
      )}

      {gate.allow === false && gate.reason === "needs-install" && (
        <div className="flex flex-col gap-4">
          {gate.platform === "chromium" ? (
            gate.canPrompt ? (
              <>
                <p className="text-sm text-grey leading-relaxed">
                  notifications live in the Form:at app — install it and be the first to hear about
                  new sets, events and line-ups.
                </p>
                <Button variant="secondary" onClick={handleNativeInstall} className="text-left">
                  install
                </Button>
                <TextButton onClick={handleClose}>not now</TextButton>
              </>
            ) : (
              <p className="text-sm text-grey leading-relaxed">
                notifications live in the Form:at app — <ManualInstallHint />
              </p>
            )
          ) : (
            <>
              <p className="text-sm text-grey leading-relaxed">
                notifications live in the Form:at app. iOS Safari only installs from the share menu
                — two taps:
              </p>
              <IosInstallSteps />
            </>
          )}
          <TextButton
            onClick={(e) => {
              e.stopPropagation();
              handleAlreadyInstalled();
            }}
          >
            already installed? open it from your home screen
          </TextButton>
        </div>
      )}

      {gate.allow === false && gate.reason === "open-app" && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-grey leading-relaxed">
            Form:at is already on your device — notifications only work from the installed app. open
            it from your home screen and tap <span className="text-white">notify_me</span> there.
          </p>
          <TextButton
            onClick={(e) => {
              e.stopPropagation();
              handleNotInstalledAfterAll();
            }}
          >
            not installed? install the app
          </TextButton>
        </div>
      )}

      {gate.allow === false && gate.reason === "cannot-install" && (
        <p className="text-sm text-grey leading-relaxed">
          notifications need the Form:at app, and this browser can't install it — open{" "}
          <span className="text-white">formatglasgow.com</span> in{" "}
          <span className="text-white">Chrome on Android</span> or{" "}
          <span className="text-white">Safari on iOS</span> to install.
        </p>
      )}
    </Modal>
  );
}
