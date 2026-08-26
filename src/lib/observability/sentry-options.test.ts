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
      exception: {
        values: [
          {
            stacktrace: {
              frames: [
                {
                  filename: "src/components/widget.tsx",
                  function: "Widget",
                  vars: { owner: "Private Owner", rent: "100.00" },
                },
              ],
            },
            type: "Error",
            value: "Property Riverside failed for USD 100.00",
          },
        ],
      },
      fingerprint: ["Private Owner", "100.00"],
      logentry: { message: "Private Owner owes 100.00" },
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
        exception: {
          values: [
            {
              stacktrace: {
                frames: [
                  {
                    filename: "src/components/widget.tsx",
                    function: "Widget",
                  },
                ],
              },
              type: "Error",
            },
          ],
        },
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
    expect(event).not.toHaveProperty("fingerprint");
    expect(event).not.toHaveProperty("logentry");
    expect(event).not.toHaveProperty("message");
  });

  it("disables performance sampling and default PII", () => {
    process.env.NEXT_PUBLIC_NESTORY_SENTRY_DSN = "https://public@example.invalid/1";
    process.env.NEXT_PUBLIC_VERCEL_ENV = "production";
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA = "a".repeat(40);
    process.env.VERCEL_ENV = "preview";
    process.env.VERCEL_GIT_COMMIT_SHA = "b".repeat(40);

    expect(buildSentryOptions("client")).toMatchObject({
      debug: false,
      dsn: "https://public@example.invalid/1",
      enabled: true,
      environment: "production",
      release: "a".repeat(40),
      sendDefaultPii: false,
      tracesSampleRate: 0,
    });
  });

  it("disables delivery when the DSN is absent", () => {
    delete process.env.NEXT_PUBLIC_NESTORY_SENTRY_DSN;
    expect(buildSentryOptions("server").enabled).toBe(false);
  });

  it("keeps standalone production browser errors visible without Vercel metadata", () => {
    process.env.NEXT_PUBLIC_NESTORY_SENTRY_DSN = "https://public@example.invalid/1";
    delete process.env.NEXT_PUBLIC_VERCEL_ENV;
    process.env = { ...process.env, NODE_ENV: "production" };

    expect(buildSentryOptions("client").environment).toBe("production");
  });

  it("classifies deployment-skew actions from exception type without retaining values", () => {
    const event = scrubSentryEvent({
      type: undefined,
      exception: {
        values: [
          {
            type: "UnrecognizedActionError",
            value: "Server Action private-action-id was not found",
          },
        ],
      },
      message: "operator@example.com retried a stale action",
    });

    expect(event?.tags).toEqual({
      error_kind: "server_action_deployment_skew",
    });
    expect(event?.exception?.values?.[0]).not.toHaveProperty("value");
    expect(event).not.toHaveProperty("message");
  });

  it.each([
    [
      "react_hydration_mismatch",
      {
        filename:
          "app:///_next/static/chunks/node_modules/react-dom/cjs/react-dom-client.production.js",
        function: "throwOnHydrationMismatch",
      },
    ],
    [
      "react_recoverable_error",
      {
        filename:
          "../node_modules/next/src/client/react-client-callbacks/on-recoverable-error.ts",
        function: "onRecoverableError",
      },
    ],
  ] as const)("classifies %s from an allowlisted frame identity", (errorKind, frame) => {
    const event = scrubSentryEvent({
      type: undefined,
      exception: {
        values: [
          {
            stacktrace: { frames: [frame] },
            type: "Error",
            value: "private rendered content",
          },
        ],
      },
    });

    expect(event?.tags).toEqual({ error_kind: errorKind });
    expect(event?.exception?.values?.[0]).not.toHaveProperty("value");
  });

  it("retains only enumerated structural capture tags", () => {
    const event = scrubSentryEvent({
      type: undefined,
      tags: {
        boundary: "dashboard",
        has_digest: "true",
        has_stack: "false",
        route: "/units/[unitId]",
      },
    });

    expect(event?.tags).toEqual({
      boundary: "dashboard",
      has_digest: "true",
      has_stack: "false",
      route: "/units/[unitId]",
    });
  });

  it("does not derive diagnostic tags from arbitrary values or caller tags", () => {
    const event = scrubSentryEvent({
      type: undefined,
      exception: {
        values: [
          {
            stacktrace: {
              frames: [
                {
                  filename: "src/private/on-recoverable-error.ts",
                  function: "onRecoverableError",
                },
              ],
            },
            type: "Error",
            value:
              "UnrecognizedActionError throwOnHydrationMismatch operator@example.com",
          },
        ],
      },
      message: "UnrecognizedActionError",
      tags: {
        boundary: "private-workspace-name",
        error_kind: "react_recoverable_error",
        has_digest: "private-digest",
        has_stack: "yes",
        route: "/units/[unitId]",
      },
    });

    expect(event?.tags).toEqual({ route: "/units/[unitId]" });
    expect(event?.exception?.values?.[0]).not.toHaveProperty("value");
    expect(event).not.toHaveProperty("message");
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
