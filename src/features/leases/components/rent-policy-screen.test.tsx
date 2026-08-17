/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RentPolicyScreen } from "@/features/leases/components/rent-policy-screen";
import type { RentPolicyVersion } from "@/features/leases/data/rent-policy";

afterEach(cleanup);

describe("RentPolicyScreen", () => {
  it("keeps historical policy evidence readable but removes ordinary writes", () => {
    render(<RentPolicyScreen versions={[makePolicy()]} />);

    expect(
      screen.getByRole("heading", { name: "Historical rent policies" }),
    ).not.toBeNull();
    expect(screen.getByText(/new leases keep these rules on the lease/i)).not.toBeNull();
    expect(screen.getByText("monthly, quarterly")).not.toBeNull();
    expect(screen.getByText("Asia/Bangkok")).not.toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(
      screen.getByLabelText("Historical rent policy versions").getAttribute("tabindex"),
    ).toBe("0");
  });

  it("explains an empty history without asking users to create a policy", () => {
    render(<RentPolicyScreen versions={[]} />);

    expect(screen.getByText("No historical policy versions.")).not.toBeNull();
    expect(screen.queryByText(/create draft/i)).toBeNull();
  });
});

function makePolicy(): RentPolicyVersion {
  return {
    approved_at: "2026-07-28T01:00:00.000Z",
    approved_by: "user-1",
    concessions_support_state: "unsupported",
    created_at: "2026-07-28T00:00:00.000Z",
    created_by: "user-1",
    due_day_source: "term",
    effective_from: "2026-08-01",
    id: "policy-approved",
    lease_end_proration_rule: "actual_days",
    lease_start_proration_rule: "actual_days",
    lifecycle: "approved",
    mid_period_rent_change_rule: "next_full_period",
    notice_period_charging_rule: "through_lease_end",
    organization_id: "organization-1",
    policy_default_due_day: null,
    rent_calculation_timezone: "Asia/Bangkok",
    rent_free_support_state: "unsupported",
    retired_at: null,
    retired_by: null,
    short_month_due_day_rule: "last_calendar_day",
    superseded_at: null,
    superseded_by: null,
    supersedes_policy_id: null,
    supported_frequencies: ["monthly", "quarterly"],
    updated_at: "2026-07-28T00:00:00.000Z",
    updated_by: "user-1",
    version_number: 1,
    waivers_support_state: "unsupported",
  };
}
