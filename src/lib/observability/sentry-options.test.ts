import { afterEach, describe, expect, it } from "vitest";

import {
  buildSentryOptions,
  normalizeSentryRoute,
  scrubSentryEvent,
  scrubSentrySpan,
  scrubSentryTransaction,
} from "@/lib/observability/sentry-options";

const originalEnvironment = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnvironment };
});

describe("Sentry event privacy", () => {
  it("removes request data and free-form identity while retaining safe tags", () => {
    const event = scrubSentryEvent({
      breadcrumbs: [
        {
          category: "ui.click",
          data: { recordName: "Private property" },
          message: "Clicked operator@example.com",
          type: "user",
        },
      ],
      extra: { amount: "100.00", note: "private" },
      message: "Failed for operator@example.com with Bearer abc123",
      request: {
        cookies: { session: "secret" },
        data: { amount: "100.00", note: "private" },
        headers: {
          authorization: "Bearer secret",
          cookie: "session=secret",
          "user-agent": "browser",
        },
        query_string: "propertyId=private-id",
        url: "https://app.example/properties/95ac813d-6930-4d19-b36d-303ce7a69c38?tab=finance",
      },
      tags: {
        organization_id: "org-1",
        role: "finance_manager",
        route: "/properties/[propertyId]",
      },
      type: undefined,
      user: {
        email: "operator@example.com",
        id: "user-1",
        ip_address: "127.0.0.1",
        username: "Operator",
      },
    });

    expect(event).toEqual(
      expect.objectContaining({
        breadcrumbs: [{ category: "ui.click", type: "user" }],
        message: "[redacted]",
        request: {
          headers: { "user-agent": "browser" },
          url: "/properties/[propertyId]",
        },
        tags: {
          organization_id: "org-1",
          role: "finance_manager",
          route: "/properties/[propertyId]",
        },
        user: { id: "user-1" },
      }),
    );
    expect(event).not.toHaveProperty("extra");
  });

  it("removes exception values and stack variables while retaining the error type", () => {
    const event = scrubSentryEvent({
      exception: {
        values: [
          {
            stacktrace: {
              frames: [
                {
                  filename: "src/features/finance/property-cash.ts",
                  function: "postCash",
                  vars: { amount: "100.00", owner: "Private Owner" },
                },
              ],
            },
            type: "Error",
            value: "Unable to post 100.00 for Private Owner",
          },
        ],
      },
      logentry: { message: "Private Owner owes 100.00" },
      message: "Payment 100.00 failed for Private Owner",
      type: undefined,
    });

    expect(event?.message).toBe("[redacted]");
    expect(event).not.toHaveProperty("logentry");
    expect(event?.exception?.values?.[0]).toMatchObject({
      type: "Error",
      value: "[redacted]",
    });
    expect(event?.exception?.values?.[0].stacktrace?.frames?.[0]).not.toHaveProperty(
      "vars",
    );
  });

  it("scrubs transaction and span payloads before tracing delivery", () => {
    const span = {
      data: {
        amount: "100.00",
        authorization: "Bearer private-token",
        email: "operator@example.com",
        "http.query": "owner=Private Owner",
        "sentry.op": "http.client",
      },
      description:
        "GET /properties/95ac813d-6930-4d19-b36d-303ce7a69c38?owner=Private",
      op: "http.client",
      span_id: "b".repeat(16),
      start_timestamp: 1,
      timestamp: 2,
      trace_id: "a".repeat(32),
    };
    const transaction = scrubSentryTransaction({
      contexts: { private: { amount: "100.00" } },
      extra: { owner: "Private Owner" },
      request: {
        data: { amount: "100.00" },
        query_string: "owner=Private",
        url: "https://app.example/properties/95ac813d-6930-4d19-b36d-303ce7a69c38?owner=Private",
      },
      spans: [span],
      transaction:
        "/properties/95ac813d-6930-4d19-b36d-303ce7a69c38?owner=Private",
      type: "transaction",
    });

    expect(transaction).toMatchObject({
      request: { url: "/properties/[propertyId]" },
      spans: [
        {
          data: { "sentry.op": "http.client" },
          description: "[http.client]",
        },
      ],
      transaction: "/properties/[propertyId]",
    });
    expect(transaction).not.toHaveProperty("contexts");
    expect(transaction).not.toHaveProperty("extra");
    expect(scrubSentrySpan(span)).not.toHaveProperty("links");
    expect(JSON.stringify(transaction)).not.toMatch(/private-token|operator@example\.com/);
  });

  it("uses safe sampling defaults and disables default PII", () => {
    process.env.NEXT_PUBLIC_NESTORY_SENTRY_DSN = "https://public@example.invalid/1";
    process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE = "not-a-number";
    process.env.NEXT_PUBLIC_VERCEL_ENV = "preview";
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA = "a".repeat(40);

    expect(buildSentryOptions("client")).toMatchObject({
      debug: false,
      dsn: "https://public@example.invalid/1",
      enabled: true,
      environment: "preview",
      release: "a".repeat(40),
      sendDefaultPii: false,
      tracesSampleRate: 0.1,
    });
  });

  it("never labels a client event production without public Vercel metadata", () => {
    process.env.NEXT_PUBLIC_NESTORY_SENTRY_DSN = "https://public@example.invalid/1";
    delete process.env.NEXT_PUBLIC_VERCEL_ENV;
    process.env.VERCEL_ENV = "production";

    expect(buildSentryOptions("client").environment).toBe("unknown");
  });

  it("disables delivery when the DSN is absent", () => {
    delete process.env.NEXT_PUBLIC_NESTORY_SENTRY_DSN;
    expect(buildSentryOptions("server").enabled).toBe(false);
  });
});

describe("Sentry route normalization", () => {
  it.each([
    [
      "/properties/95ac813d-6930-4d19-b36d-303ce7a69c38?tab=finance",
      "/properties/[propertyId]",
    ],
    [
      "/leases/32f1e55b-4b83-4f43-b9d7-eb75280dcc07/edit",
      "/leases/[leaseId]/edit",
    ],
    ["https://app.example/overview?ownerStatus=missing", "/overview"],
  ])("normalizes %s without retaining record ids", (input, expected) => {
    expect(normalizeSentryRoute(input)).toBe(expected);
  });
});
