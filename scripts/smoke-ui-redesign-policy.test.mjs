import { describe, expect, it } from "vitest";
import {
  createReadOnlyRequestPolicy,
  validateLocalBaseUrl,
} from "./smoke-ui-redesign-policy.mjs";

describe("validateLocalBaseUrl", () => {
  it.each([
    ["http://localhost:3000/", "http://localhost:3000"],
    ["https://127.0.0.1:3443/path?mode=smoke#result", "https://127.0.0.1:3443"],
    ["http://[::1]:3000/", "http://[::1]:3000"],
  ])("accepts the loopback base URL %s", (value, expected) => {
    expect(validateLocalBaseUrl(value)).toBe(expected);
  });

  it("rejects a remote host", () => {
    expect(() => validateLocalBaseUrl("https://nestory.example.com")).toThrow(
      "BASE_URL must use a loopback host",
    );
  });

  it("rejects URL userinfo", () => {
    expect(() => validateLocalBaseUrl("http://user:secret@localhost:3000")).toThrow(
      "BASE_URL must not include userinfo",
    );
  });

  it("rejects a non-http protocol", () => {
    expect(() => validateLocalBaseUrl("file://localhost/tmp/nestory")).toThrow(
      "BASE_URL must use http or https",
    );
  });
});

describe("createReadOnlyRequestPolicy", () => {
  it("blocks an arbitrary same-origin POST before authentication", () => {
    const policy = createPolicy();

    expect(
      policy.evaluate({
        headers: { "next-action": "landing-action" },
        method: "POST",
        url: "http://localhost:3000/overview",
      }).allowed,
    ).toBe(false);
  });

  it("allows exactly one login server action POST", () => {
    const policy = createPolicy();
    const request = loginRequest();

    expect(policy.evaluate(request).allowed).toBe(true);
    expect(policy.evaluate(request).allowed).toBe(false);
  });

  it("blocks a login POST without Next-Action", () => {
    const policy = createPolicy();

    expect(
      policy.evaluate({
        headers: {},
        method: "POST",
        url: "http://localhost:3000/login",
      }).allowed,
    ).toBe(false);
  });

  it("blocks a later landing-page POST after authentication", () => {
    const policy = createPolicy();

    expect(policy.evaluate(loginRequest()).allowed).toBe(true);
    expect(
      policy.evaluate({
        headers: { "next-action": "landing-action" },
        method: "POST",
        url: "http://localhost:3000/",
      }).allowed,
    ).toBe(false);
  });

  it("continues to allow read-only methods after authentication", () => {
    const policy = createPolicy();

    expect(policy.evaluate(loginRequest()).allowed).toBe(true);

    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      expect(
        policy.evaluate({
          headers: {},
          method,
          url: "http://localhost:3000/properties",
        }).allowed,
      ).toBe(true);
    }
  });
});

function createPolicy() {
  return createReadOnlyRequestPolicy({ baseUrl: "http://localhost:3000" });
}

function loginRequest() {
  return {
    headers: { "next-action": "login-action" },
    method: "POST",
    url: "http://localhost:3000/login",
  };
}
