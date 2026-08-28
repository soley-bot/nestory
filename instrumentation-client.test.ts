// @vitest-environment jsdom

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { getNonce, setNonce } from "get-nonce";
import { stylesheetSingleton } from "react-style-singleton";

const { captureRouterTransitionStart, sentryInit } = vi.hoisted(() => ({
  captureRouterTransitionStart: vi.fn(),
  sentryInit: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureRouterTransitionStart,
  init: sentryInit,
}));
vi.mock("@/lib/observability/sentry-options", () => ({
  buildSentryOptions: () => ({ enabled: false }),
}));

let instrumentation: typeof import("./instrumentation-client");
let nonceAtSentryInit: string | undefined;

beforeAll(async () => {
  const frameworkScript = document.createElement("script");
  frameworkScript.nonce = "request-nonce";
  document.head.append(frameworkScript);

  sentryInit.mockImplementationOnce(() => {
    nonceAtSentryInit = getNonce();
  });

  instrumentation = await import("./instrumentation-client");
});

afterAll(() => {
  setNonce("");
  document.head.replaceChildren();
});

describe("client CSP bootstrap", () => {
  it("seeds the request nonce before Sentry initialization", () => {
    expect(nonceAtSentryInit).toBe("request-nonce");
  });

  it("applies the request nonce to runtime styles injected by UI dependencies", () => {
    const stylesheet = stylesheetSingleton();
    stylesheet.add(".runtime-style { overflow: hidden; }");

    const runtimeStyle = document.head.querySelector("style");
    expect(runtimeStyle?.nonce).toBe("request-nonce");

    stylesheet.remove();
  });

  it("exports Sentry's App Router transition hook", () => {
    expect(instrumentation.onRouterTransitionStart).toBe(
      captureRouterTransitionStart,
    );
  });
});
