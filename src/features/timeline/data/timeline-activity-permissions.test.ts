import { describe, expect, it } from "vitest";
import { filterTimelineActivityEntityTypes } from "./timeline-activity-permissions";
import { OPERATIONS_TEMPLATE } from "@/lib/auth/role-templates";
import { PERMISSION_KEYS } from "@/lib/auth/permission-catalog";

const entityTypes = [
  "timeline_event", "document", "property", "unit", "lease", "ledger_entry",
  "financial_month", "finance_income_item", "finance_expense_item", "petty_cash_entry",
  "task", "tenant_request",
];

describe("timeline activity domain permissions", () => {
  it("excludes lease and finance domains for the Operations role", () => {
    expect(filterTimelineActivityEntityTypes(entityTypes, new Set(OPERATIONS_TEMPLATE.permissions))).toEqual([
      "timeline_event", "document", "property", "unit", "task", "tenant_request",
    ]);
  });

  it("requires the relevant domain view permission, including month-lock activity", () => {
    expect(filterTimelineActivityEntityTypes(entityTypes, new Set(["finance.view"]))).toEqual([
      "timeline_event", "document", "ledger_entry", "financial_month", "finance_income_item",
      "finance_expense_item", "petty_cash_entry",
    ]);
    expect(filterTimelineActivityEntityTypes(entityTypes, new Set(["leases.view"]))).toEqual([
      "timeline_event", "document", "lease",
    ]);
    expect(filterTimelineActivityEntityTypes(entityTypes, new Set(["maintenance.view"]))).toEqual([
      "timeline_event", "document", "task", "tenant_request",
    ]);
  });

  it("fails closed for absent view permissions and unknown entity types", () => {
    expect(filterTimelineActivityEntityTypes(entityTypes, new Set())).toEqual([]);
    expect(filterTimelineActivityEntityTypes(entityTypes, new Set(["leases.prepare"]))).toEqual([]);
    expect(filterTimelineActivityEntityTypes(["unknown", "constructor", "__proto__"], new Set(PERMISSION_KEYS))).toEqual([]);
  });
});
