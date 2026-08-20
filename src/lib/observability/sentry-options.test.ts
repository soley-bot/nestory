import { afterEach, describe, expect, it } from "vitest";

import {
  buildSentryOptions,
  normalizeSentryRoute,
  scrubSentryEvent,
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
        message: "Failed for [redacted-email] with [redacted-token]",
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

  it("uses safe sampling defaults and disables default PII", () => {
    process.env.NEXT_PUBLIC_NESTORY_SENTRY_DSN = "https://public@example.invalid/1";
    process.env.SENTRY_TRACES_SAMPLE_RATE = "not-a-number";
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_GIT_COMMIT_SHA = "a".repeat(40);

    expect(buildSentryOptions("client")).toMatchObject({
      debug: false,
      dsn: "https://public@example.invalid/1",
      enabled: true,
      environment: "production",
      release: "a".repeat(40),
      sendDefaultPii: false,
      tracesSampleRate: 0.1,
    });
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
