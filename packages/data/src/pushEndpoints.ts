// Which hosts we are willing to send a push notification to.
//
// WHY THIS EXISTS: a subscription endpoint is attacker-supplied. `/api/push-subscribe`
// is public and unauthenticated (it has to be — the browser calls it), and whatever
// it stores is later handed straight to `fetch(endpoint, { method: "POST" })` in
// webPush.ts. Without a host check, anyone can register `https://their-server/`
// and turn a push send into an outbound request aimed wherever they like. The
// encrypted payload leaks nothing, but the requests still originate from us.
//
// MATCH ON THE PARSED HOSTNAME, NEVER ON A STRING PREFIX. `https://fcm.googleapis.com@evil.example/`
// and `https://fcm.googleapis.com.evil.example/` both pass a naive
// `startsWith("https://fcm.googleapis.com")` and both point at the attacker.
// `new URL()` resolves userinfo and the real host, which is the only reason
// this check is worth anything.
//
// SOURCES for the list below, rather than memory:
//   - web-push-libs' own endpoint reference documents Chrome as
//     `fcm.googleapis.com/fcm/send/…` under VAPID and `android.googleapis.com/gcm/send/…`
//     on the older GCM path, Firefox as `updates.push.services.mozilla.com/wpush/…`,
//     and notes Opera and Vivaldi reuse Chrome's service.
//   - Apple's Safari web-push guidance says to allow **any subdomain of
//     push.apple.com** rather than a single host, which is why that entry is a
//     suffix match and not `web.push.apple.com`.
//   - `notify.windows.com` covers WNS, used by pre-Chromium Edge. Current Edge is
//     Chromium and lands on FCM; the entry costs nothing and avoids a silent
//     rejection for anyone still on the old engine.
//   Samsung Internet, Brave and Opera are all Chromium and use FCM — covered.
//
// KNOWN FAILURE MODE, worth accepting deliberately: if a vendor moves to a new
// hostname, subscribing silently stops working for that browser — `validate()`
// returns null and the endpoint responds 204 like everything else it rejects.
// That is the safe direction to fail, but it is invisible. If push subscriptions
// dry up for one browser and no other explanation fits, suspect this list first
// and check the endpoint the browser actually handed back.
const PUSH_SERVICE_HOSTS = [
  "fcm.googleapis.com",
  "android.googleapis.com",
  "push.services.mozilla.com",
  "push.apple.com",
  "notify.windows.com",
] as const;

/** True when `hostname` is `base` itself or a subdomain of it. The `.` prefix is
 *  load-bearing: without it, `evilpush.apple.com` would match `push.apple.com`. */
function isHostOrSubdomainOf(hostname: string, base: string): boolean {
  return hostname === base || hostname.endsWith(`.${base}`);
}

/**
 * Whether `endpoint` is a URL we will POST a push notification to.
 *
 * Enforced in BOTH directions of the data's life, deliberately:
 *   - at write time in `/api/push-subscribe`, so junk never enters the table;
 *   - at send time in `sendWebPush`, because rows written before this check
 *     existed are still in `push_subscriptions` and the send path reads the
 *     database, not the validator.
 * Dropping either one leaves the other doing half a job.
 */
export function isAllowedPushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  // Push services are HTTPS-only. Checked here rather than by the caller so the
  // scheme and the host can't drift apart between the two call sites.
  if (url.protocol !== "https:") return false;
  return PUSH_SERVICE_HOSTS.some((base) => isHostOrSubdomainOf(url.hostname, base));
}
