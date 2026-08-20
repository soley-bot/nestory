// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  setTag: vi.fn(),
  setTags: vi.fn(),
  setUser: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => sentry);

import { SentryIdentity } from "@/components/observability/sentry-identity";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("SentryIdentity", () => {
  it("sets only scoped workspace identity and clears it on unmount", async () => {
    const { unmount } = render(
      <SentryIdentity
        organizationId="org-1"
        role="finance_manager"
        userId="user-1"
      />,
    );

    await waitFor(() => {
      expect(sentry.setUser).toHaveBeenCalledWith({
        id: expect.stringMatching(/^[0-9a-f]{64}$/),
      });
      expect(sentry.setTags).toHaveBeenCalledWith({
        organization_id: expect.stringMatching(/^[0-9a-f]{64}$/),
        role: "finance_manager",
      });
    });
    expect(JSON.stringify(sentry.setUser.mock.calls)).not.toContain("user-1");
    expect(JSON.stringify(sentry.setTags.mock.calls)).not.toContain("org-1");

    unmount();

    expect(sentry.setUser).toHaveBeenLastCalledWith(null);
    expect(sentry.setTag).toHaveBeenCalledWith("organization_id", undefined);
    expect(sentry.setTag).toHaveBeenCalledWith("role", undefined);
  });
});
