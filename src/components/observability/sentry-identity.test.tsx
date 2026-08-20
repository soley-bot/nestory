// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
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
  it("sets pseudonymous workspace identity and clears it on unmount", () => {
    const { unmount } = render(
      <SentryIdentity
        organizationId="org-1"
        role="finance_manager"
        userId="user-1"
      />,
    );

    expect(sentry.setUser).toHaveBeenCalledWith({ id: "user-1" });
    expect(sentry.setTags).toHaveBeenCalledWith({
      organization_id: "org-1",
      role: "finance_manager",
    });

    unmount();

    expect(sentry.setUser).toHaveBeenLastCalledWith(null);
    expect(sentry.setTag).toHaveBeenCalledWith("organization_id", undefined);
    expect(sentry.setTag).toHaveBeenCalledWith("role", undefined);
  });
});
