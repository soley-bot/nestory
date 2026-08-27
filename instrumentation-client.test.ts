// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { setNonce } from "get-nonce";
import { stylesheetSingleton } from "react-style-singleton";

vi.mock("@sentry/nextjs", () => ({ init: vi.fn() }));
vi.mock("@/lib/observability/sentry-options", () => ({
  buildSentryOptions: () => ({ enabled: false }),
}));

afterEach(() => {
  setNonce("");
  document.head.replaceChildren();
});

describe("client CSP bootstrap", () => {
  it("applies the request nonce to runtime styles injected by UI dependencies", async () => {
    const frameworkScript = document.createElement("script");
    frameworkScript.nonce = "request-nonce";
    document.head.append(frameworkScript);

    await import("./instrumentation-client");

    const stylesheet = stylesheetSingleton();
    stylesheet.add(".runtime-style { overflow: hidden; }");

    const runtimeStyle = document.head.querySelector("style");
    expect(runtimeStyle?.nonce).toBe("request-nonce");

    stylesheet.remove();
  });
});
