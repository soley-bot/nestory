import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  permanentRedirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({ permanentRedirect: mocks.permanentRedirect }));

import FundingSourcesPage from "@/app/(dashboard)/finance/funding-sources/page";

describe("Finance funding sources route", () => {
  it("permanently redirects the retired route to Chart of Accounts", () => {
    // Break caught: leaving the old page active preserves two customer-facing
    // sources of truth for account setup.
    FundingSourcesPage();
    expect(mocks.permanentRedirect).toHaveBeenCalledWith("/finance/accounts");
  });
});
