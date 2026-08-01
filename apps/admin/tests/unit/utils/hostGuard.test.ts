import { describe, expect, it } from "vitest";
import { ALLOWED_HOST, isAllowedHost } from "~/utils/hostGuard";

describe("isAllowedHost", () => {
  it("allows the production hostname", () => {
    expect(isAllowedHost(ALLOWED_HOST)).toBe(true);
  });

  it("allows localhost and 127.0.0.1 for local dev, preview, and e2e", () => {
    expect(isAllowedHost("localhost")).toBe(true);
    expect(isAllowedHost("127.0.0.1")).toBe(true);
  });

  it("rejects the Cloudflare Pages default domain", () => {
    expect(isAllowedHost("form-at-admin.pages.dev")).toBe(false);
  });

  it("rejects per-deployment preview URLs", () => {
    expect(isAllowedHost("cd9a05fe.form-at-admin.pages.dev")).toBe(false);
  });

  it("rejects an unrelated or spoofed hostname", () => {
    expect(isAllowedHost("evil.example.com")).toBe(false);
  });
});
