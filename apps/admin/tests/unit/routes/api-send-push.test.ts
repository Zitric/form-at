import { describe, expect, it } from "vitest";
import { validate } from "~/routes/api/send-push";

// Mirrors api/push-subscribe.ts's validate() test style — required/optional
// fields, type/length checks. Less paranoid than that endpoint's own tests
// since this is reached only by an Access-authenticated admin filling out a
// form, not arbitrary public input, but still a real sanity check.
describe("send-push validate", () => {
  it("accepts title + body only", () => {
    expect(validate({ title: "New set", body: "Check it out" })).toEqual({
      title: "New set",
      body: "Check it out",
      url: undefined,
      image: undefined,
    });
  });

  it("accepts title + body + url + image", () => {
    expect(
      validate({
        title: "New set",
        body: "Check it out",
        url: "/sets/003",
        image: "/images/sets/003.webp",
      }),
    ).toEqual({
      title: "New set",
      body: "Check it out",
      url: "/sets/003",
      image: "/images/sets/003.webp",
    });
  });

  it("accepts an https:// url/image (not just site-relative)", () => {
    expect(
      validate({ title: "t", body: "b", url: "https://formatglasgow.com/sets/003" }),
    ).not.toBeNull();
  });

  it.each([null, undefined, "a string", 42, []])("rejects a non-object payload: %s", (raw) => {
    expect(validate(raw)).toBeNull();
  });

  it("rejects a missing title", () => {
    expect(validate({ body: "b" })).toBeNull();
  });

  it("rejects an empty title", () => {
    expect(validate({ title: "", body: "b" })).toBeNull();
  });

  it("rejects a title over the length cap", () => {
    expect(validate({ title: "a".repeat(201), body: "b" })).toBeNull();
  });

  it("rejects a missing body", () => {
    expect(validate({ title: "t" })).toBeNull();
  });

  it("rejects an empty body", () => {
    expect(validate({ title: "t", body: "" })).toBeNull();
  });

  it("rejects a body over the length cap", () => {
    expect(validate({ title: "t", body: "a".repeat(1001) })).toBeNull();
  });

  it("rejects a url that isn't site-relative or https", () => {
    expect(validate({ title: "t", body: "b", url: "javascript:alert(1)" })).toBeNull();
    expect(validate({ title: "t", body: "b", url: "http://insecure.example.com" })).toBeNull();
  });

  it("rejects a non-string url", () => {
    expect(validate({ title: "t", body: "b", url: 123 })).toBeNull();
  });

  it("rejects an image that isn't site-relative or https", () => {
    expect(validate({ title: "t", body: "b", image: "not-a-path" })).toBeNull();
  });
});
