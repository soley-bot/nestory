import { describe, expect, it } from "vitest";

import { buildScopedSentryIdentity } from "@/lib/observability/sentry-identity";

describe("buildScopedSentryIdentity", () => {
  it("never returns the source user or organization identifiers", async () => {
    const identity = await buildScopedSentryIdentity({
      organizationId: "org-1",
      role: "finance_manager",
      userId: "user-1",
    });

    expect(identity).toEqual({
      role: "finance_manager",
      scopedOrganizationId: expect.stringMatching(/^[0-9a-f]{64}$/),
      scopedUserId: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    expect(JSON.stringify(identity)).not.toMatch(/org-1|user-1/);
  });

  it("scopes the same user differently in different organizations", async () => {
    const first = await buildScopedSentryIdentity({
      organizationId: "org-1",
      role: "super_admin",
      userId: "user-1",
    });
    const second = await buildScopedSentryIdentity({
      organizationId: "org-2",
      role: "super_admin",
      userId: "user-1",
    });

    expect(second.scopedUserId).not.toBe(first.scopedUserId);
  });
});
