import { describe, expect, it } from "vitest";
import {
  buildTimelineSearchClauses,
  FINANCIAL_TIMELINE_SCOPE_FILTER,
  getRecentActivityEntityTypes,
  getTimelineScopeEventTypes,
} from "@/features/timeline/data/timeline";

describe("timeline scope helpers", () => {
  it("limits maintenance scope to maintenance-style event types", () => {
    expect(getTimelineScopeEventTypes("maintenance")).toEqual([
      "Maintenance",
      "Repair",
      "Renovation",
      "Inspection",
    ]);
    expect(getTimelineScopeEventTypes("global")).toBeNull();
  });

  it("uses ledger-linked or cost-bearing rows for financial scope", () => {
    expect(FINANCIAL_TIMELINE_SCOPE_FILTER).toBe(
      "ledger_entry_id.not.is.null,cost_amount.not.is.null",
    );
  });

  it("broadens recent activity by route scope", () => {
    expect(getRecentActivityEntityTypes("maintenance")).toEqual([
      "timeline_event",
      "task",
      "tenant_request",
    ]);
    expect(getRecentActivityEntityTypes("financial")).toEqual([
      "timeline_event",
      "ledger_entry",
      "ledger_period",
      "finance_income_item",
      "finance_expense_item",
      "petty_cash_entry",
    ]);
  });
});

describe("buildTimelineSearchClauses", () => {
  it("searches timeline text plus matched linked record ids", () => {
    expect(
      buildTimelineSearchClauses("%north%", {
        eventIds: ["event-1"],
        ledgerEntryIds: ["ledger-1"],
        leaseIds: ["lease-1"],
        propertyIds: ["property-1"],
        unitIds: ["unit-1"],
      }),
    ).toEqual([
      "title.ilike.%north%",
      "description.ilike.%north%",
      "id.in.(event-1)",
      "ledger_entry_id.in.(ledger-1)",
      "lease_id.in.(lease-1)",
      "property_id.in.(property-1)",
      "unit_id.in.(unit-1)",
    ]);
  });
});
