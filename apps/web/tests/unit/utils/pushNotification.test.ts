import { describe, expect, it } from "vitest";
import { buildNotificationOptions, resolveNotificationClickUrl } from "~/utils/pushNotification";

// Locks the notification-polish pass: every
// new optional PushPayload field (image, requireInteraction, timestamp)
// must be conditionally applied — present only when the payload actually
// asked for it — while the fixed, non-payload-driven parts (vibrate
// pattern, action buttons) apply unconditionally to every push. This is the
// pure half of sw.ts's push handling; sw.ts itself has no jsdom harness.

describe("buildNotificationOptions — always-present shape", () => {
  it("sets body/icon/badge/vibrate/actions/data from a minimal payload", () => {
    const options = buildNotificationOptions({ title: "t", body: "hello" });

    expect(options.body).toBe("hello");
    expect(options.icon).toBe("/icon-192.png");
    expect(options.badge).toBe("/badge-96.png");
    expect(options.vibrate).toEqual([100, 50, 100]);
    expect(options.actions).toEqual([
      { action: "view", title: "view" },
      { action: "later", title: "later" },
    ]);
    expect(options.data).toEqual({ url: "/" });
  });

  it("falls back to an empty body and '/' url when the payload omits them", () => {
    const options = buildNotificationOptions({});
    expect(options.body).toBe("");
    expect(options.data).toEqual({ url: "/" });
  });

  it("carries the payload's url through to data.url", () => {
    const options = buildNotificationOptions({ title: "t", body: "b", url: "/sets/003" });
    expect(options.data).toEqual({ url: "/sets/003" });
  });
});

describe("buildNotificationOptions — optional fields are conditionally applied", () => {
  it("omits image, requireInteraction, and timestamp entirely when not in the payload", () => {
    const options = buildNotificationOptions({ title: "t", body: "b" });
    expect("image" in options).toBe(false);
    expect("requireInteraction" in options).toBe(false);
    expect("timestamp" in options).toBe(false);
  });

  it("sets image when the payload includes one", () => {
    const options = buildNotificationOptions({
      title: "t",
      body: "b",
      image: "/images/sets/003-1080.webp",
    });
    expect(options.image).toBe("/images/sets/003-1080.webp");
  });

  it("sets requireInteraction only when explicitly true — false is treated as absent", () => {
    expect(buildNotificationOptions({ title: "t", body: "b", requireInteraction: true })).toEqual(
      expect.objectContaining({ requireInteraction: true }),
    );
    expect(
      "requireInteraction" in
        buildNotificationOptions({ title: "t", body: "b", requireInteraction: false }),
    ).toBe(false);
  });

  it("sets timestamp via a presence check, not a truthiness check — 0 is a legitimate value", () => {
    const options = buildNotificationOptions({ title: "t", body: "b", timestamp: 0 });
    expect(options.timestamp).toBe(0);
    expect("timestamp" in options).toBe(true);
  });

  it("sets timestamp to the payload's actual value", () => {
    const options = buildNotificationOptions({
      title: "t",
      body: "b",
      timestamp: 1_700_000_000_000,
    });
    expect(options.timestamp).toBe(1_700_000_000_000);
  });
});

describe("resolveNotificationClickUrl — action routing", () => {
  it("'later' always resolves to null (close only, never navigate) regardless of the stored url", () => {
    expect(resolveNotificationClickUrl("later", "/sets/003")).toBeNull();
    expect(resolveNotificationClickUrl("later", undefined)).toBeNull();
  });

  it("a body tap (empty action string) navigates to the stored url", () => {
    expect(resolveNotificationClickUrl("", "/sets/003")).toBe("/sets/003");
  });

  it("the 'view' action navigates to the same url a body tap would", () => {
    expect(resolveNotificationClickUrl("view", "/events/012")).toBe("/events/012");
  });

  it("falls back to '/' when there is no stored url, for both body taps and 'view'", () => {
    expect(resolveNotificationClickUrl("", undefined)).toBe("/");
    expect(resolveNotificationClickUrl("view", undefined)).toBe("/");
  });
});
