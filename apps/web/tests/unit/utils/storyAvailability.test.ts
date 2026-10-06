import { describe, expect, it } from "vitest";
import {
  STORY_LAUNCHED_ON_ANDROID,
  type StoryEnvironment,
  storyEntryState,
} from "~/utils/storyAvailability";

// Real UA strings, the same ones the install-capability tests use.
const UA = {
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.230 Mobile Safari/537.36",
  samsungInternet:
    "Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36",
  instagramAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-S916U Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/119.0.6045.66 Mobile Safari/537.36 Instagram 309.0.0.40.113 Android (34/14; 510dpi; 1080x2113; samsung; SM-S916U; dm2q; qcom; en_US; 536988425)",
  facebookAndroid:
    "Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230805.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.5845.163 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/430.0.0.23.113;]",
  firefoxAndroid: "Mozilla/5.0 (Android 14; Mobile; rv:120.0) Gecko/120.0 Firefox/120.0",
  operaAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.6533.103 Mobile Safari/537.36 OPR/84.0.4452.82342",
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  desktopChrome:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

// A Chrome tab on an Android phone that can record, no flag.
const base: StoryEnvironment = {
  ua: UA.chromeAndroid,
  coarsePointer: true,
  flag: false,
  standalone: false,
  online: true,
  canRecord: true,
};
const state = (env: Partial<StoryEnvironment>, launched?: boolean) =>
  storyEntryState({ ...base, ...env }, launched);

describe("storyEntryState on Android, without the flag", () => {
  it("is launched", () => {
    expect(STORY_LAUNCHED_ON_ANDROID).toBe(true);
  });

  it("Chrome tab: the install gate", () => {
    expect(state({})).toBe("gate");
  });

  it("installed app: the picker, or the offline line", () => {
    expect(state({ standalone: true })).toBe("picker");
    expect(state({ standalone: true, online: false })).toBe("offline");
  });

  it("Samsung Internet tab: the gate when it records MP4, nothing when it doesn't", () => {
    expect(state({ ua: UA.samsungInternet })).toBe("gate");
    expect(state({ ua: UA.samsungInternet, canRecord: false })).toBe("hidden");
  });

  // The gate sends them to Chrome; their own engine can't speak for Chrome's.
  it("Instagram's and Facebook's browsers: the gate, whatever they record", () => {
    expect(state({ ua: UA.instagramAndroid })).toBe("gate");
    expect(state({ ua: UA.instagramAndroid, canRecord: false })).toBe("gate");
    expect(state({ ua: UA.facebookAndroid, canRecord: false })).toBe("gate");
  });

  it("Firefox, which records no MP4: the gate, which sends it to Chrome", () => {
    expect(state({ ua: UA.firefoxAndroid, canRecord: false })).toBe("gate");
  });

  // They only add a shortcut, so the gate sends them to Chrome; their own
  // recording support says nothing about Chrome's.
  it("Opera and Brave tabs: the gate, whatever they record", () => {
    expect(state({ ua: UA.operaAndroid, canRecord: false })).toBe("gate");
    expect(state({ brave: true, canRecord: false })).toBe("gate");
  });

  it("no H.264 + AAC MP4 recording: no entry, in a Chrome tab or the app", () => {
    expect(state({ canRecord: false })).toBe("hidden");
    expect(state({ standalone: true, canRecord: false })).toBe("hidden");
    expect(state({ standalone: true, online: false, canRecord: false })).toBe("hidden");
  });

  it("a fine pointer (no touchscreen) or a desktop UA: no entry", () => {
    expect(state({ coarsePointer: false })).toBe("hidden");
    expect(state({ ua: UA.desktopChrome })).toBe("hidden");
  });
});

describe("storyEntryState elsewhere", () => {
  it("iPhone: only with the flag", () => {
    expect(state({ ua: UA.iphoneSafari })).toBe("hidden");
    expect(state({ ua: UA.iphoneSafari, flag: true })).toBe("gate");
    expect(state({ ua: UA.iphoneSafari, flag: true, standalone: true })).toBe("picker");
  });

  it("desktop: never, flag or not", () => {
    expect(state({ ua: UA.desktopChrome, coarsePointer: false, flag: true })).toBe("hidden");
  });
});

// The rollback switch: false puts Android back behind the flag.
describe("with STORY_LAUNCHED_ON_ANDROID false", () => {
  it("hides Android without the flag, and shows it with", () => {
    expect(state({}, false)).toBe("hidden");
    expect(state({ standalone: true }, false)).toBe("hidden");
    expect(state({ flag: true }, false)).toBe("gate");
    expect(state({ flag: true, standalone: true }, false)).toBe("picker");
  });
});
