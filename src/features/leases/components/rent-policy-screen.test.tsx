/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RentPolicyScreen } from "@/features/leases/components/rent-policy-screen";
import type { RentPolicyVersion } from "@/features/leases/data/rent-policy";

vi.mock("@/features/leases/actions", () => ({
  approveRentPolicyVersionAction: async () => ({}),
  createRentPolicyDraftAction: async () => ({}),
  updateRentPolicyDraftAction: async () => ({}),
}));

afterEach(cleanup);

describe("RentPolicyScreen", () => {
  it("keeps missing policy rules unresolved instead of rendering defaults", () => {
    render(<RentPolicyScreen versions={[makeDraft()]} />);

    expect(screen.getByText("Draft unresolved")).not.toBeNull();
    expect(screen.getAllByText("Resolve this rule").length).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "Approve immutable version" }),
    ).not.toBeNull();
    expect(
      screen.getByText(/corrections require a later version/i),
    ).not.toBeNull();
  });

  it("creates an empty effective-dated draft when no policy exists", () => {
    render(<RentPolicyScreen versions={[]} />);

    expect(screen.getByText("No approved policy")).not.toBeNull();
    expect(screen.getByLabelText("Policy effective date")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: "Create unresolved draft" }),
    ).not.toBeNull();
    expect(screen.getByText(/does not invent a due day/i)).not.toBeNull();
    expect(
      screen.getByLabelText("Rent policy version history").getAttribute(
        "tabindex",
      ),
    ).toBe("0");
  });

  it("renders approved policy history and offers a later draft", () => {
    render(
      <RentPolicyScreen
        versions={[
          makeApproved({
            id: "policy-2",
            rent_calculation_timezone: null,
            supported_frequencies: null,
            version_number: 2,
          }),
          makeApproved(),
        ]}
      />,
    );

    expect(screen.getByText("Approved version available")).not.toBeNull();
    expect(screen.getByText("monthly, quarterly")).not.toBeNull();
    expect(screen.getAllByText("Unresolved")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Create unresolved draft" }),
    ).not.toBeNull();
    expect(
      screen.queryByRole("button", { name: "Approve immutable version" }),
    ).toBeNull();
  });

  it("omits the policy default day when due dates come from each term", () => {
    render(
      <RentPolicyScreen
        versions={[
          {
            ...makeDraft(),
            due_day_source: "term",
            policy_default_due_day: 12,
          },
        ]}
      />,
    );

    expect(
      document.querySelector('input[name="policyDefaultDueDay"]'),
    ).toBeNull();
  });
});

function makeDraft(): RentPolicyVersion {
  return {
    approved_at: null,
    approved_by: null,
    concessions_support_state: null,
    created_at: "2026-07-28T00:00:00.000Z",
    created_by: "user-1",
    due_day_source: null,
    effective_from: "2026-08-01",
    id: "policy-1",
    lease_end_proration_rule: null,
    lease_start_proration_rule: null,
    lifecycle: "draft",
    mid_period_rent_change_rule: null,
    notice_period_charging_rule: null,
    organization_id: "organization-1",
    policy_default_due_day: null,
    rent_calculation_timezone: null,
    rent_free_support_state: null,
    retired_at: null,
    retired_by: null,
    short_month_due_day_rule: null,
    superseded_at: null,
    superseded_by: null,
    supersedes_policy_id: null,
    supported_frequencies: null,
    updated_at: "2026-07-28T00:00:00.000Z",
    updated_by: "user-1",
    version_number: 1,
    waivers_support_state: null,
  };
}

function makeApproved(
  overrides: Partial<RentPolicyVersion> = {},
): RentPolicyVersion {
  return {
    ...makeDraft(),
    approved_at: "2026-07-28T01:00:00.000Z",
    approved_by: "user-1",
    concessions_support_state: "unsupported",
    due_day_source: "term",
    id: "policy-approved",
    lease_end_proration_rule: "actual_days",
    lease_start_proration_rule: "actual_days",
    lifecycle: "approved",
    mid_period_rent_change_rule: "next_full_period",
    notice_period_charging_rule: "through_lease_end",
    rent_calculation_timezone: "Asia/Bangkok",
    rent_free_support_state: "unsupported",
    short_month_due_day_rule: "last_calendar_day",
    supported_frequencies: ["monthly", "quarterly"],
    version_number: 1,
    waivers_support_state: "unsupported",
    ...overrides,
  };
}
