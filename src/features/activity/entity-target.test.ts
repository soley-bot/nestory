import { describe, expect, it } from "vitest";
import {
  activityEntityTypes,
  resolveActivityEntityTarget,
} from "@/features/activity/entity-target";

const id = "11111111-1111-4111-8111-111111111111";

describe("resolveActivityEntityTarget", () => {
  it("keeps the supported activity entity types centralized", () => {
    expect(activityEntityTypes).toEqual([
      "timeline_event",
      "ledger_entry",
      "ledger_period",
      "accounting_journal_entry",
      "accounting_period",
      "finance_income_item",
      "finance_expense_item",
      "petty_cash_entry",
      "petty_cash_account",
      "petty_cash_period",
      "task",
      "tenant_request",
      "document",
      "lease",
      "property",
      "unit",
      "person",
      "import",
      "organization",
      "organization_branch",
      "organization_invitation",
      "organization_membership",
      "people_leases_backfill",
    ]);
  });

  it.each([
    [
      "timeline_event",
      "Timeline",
      `/timeline?archiveState=all&eventId=${id}`,
      "Open Timeline event",
    ],
    [
      "ledger_entry",
      "Ledger",
      `/ledger?archiveState=all&entryId=${id}`,
      "Open Ledger entry",
    ],
    [
      "finance_income_item",
      "Rent & Income",
      `/rent-income?archiveState=all&incomeItemId=${id}`,
      "Open Rent & Income record",
    ],
    [
      "finance_expense_item",
      "Bills & Expenses",
      `/bills-expenses?archiveState=all&expenseItemId=${id}`,
      "Open Bills & Expenses record",
    ],
    [
      "petty_cash_entry",
      "Petty Cash",
      `/petty-cash?entryId=${id}`,
      "Open Petty Cash row",
    ],
    [
      "task",
      "Maintenance",
      `/maintenance?archiveState=all&taskId=${id}`,
      "Open maintenance case",
    ],
    [
      "document",
      "Document",
      `/documents?archiveState=all&documentId=${id}`,
      "Open document",
    ],
    [
      "lease",
      "Lease",
      `/leases?archiveState=all&leaseId=${id}`,
      "Open lease",
    ],
    ["property", "Property", `/properties/${id}`, "Open property"],
    ["unit", "Unit", `/units/${id}`, "Open unit"],
    ["person", "Person", `/people/${id}`, "Open person"],
  ])(
    "builds the exact %s source target",
    (entityType, entityLabel, href, actionLabel) => {
      expect(
        resolveActivityEntityTarget({
          entityId: id,
          entityType,
          recordLabel: "Snapshot label",
        }),
      ).toEqual({
        actionLabel,
        entityLabel,
        focusMode: "exact",
        href,
        recordLabel: "Snapshot label",
      });
    },
  );

  it("builds a ledger-period month target from safe snapshot context", () => {
    expect(
      resolveActivityEntityTarget({
        entityId: id,
        entityType: "ledger_period",
        periodStart: "2026-07-01",
        recordLabel: "July 2026",
      }),
    ).toMatchObject({
      focusMode: "module",
      href: "/ledger?dateFrom=2026-07-01&dateTo=2026-07-31",
    });
  });

  it("uses a controlled module target for tenant requests without a dedicated view", () => {
    expect(
      resolveActivityEntityTarget({
        entityId: id,
        entityType: "tenant_request",
        recordLabel: "Leaking pipe",
      }),
    ).toEqual({
      actionLabel: "Open Maintenance",
      entityLabel: "Maintenance",
      focusMode: "module",
      href: "/maintenance?archiveState=all",
      recordLabel: "Leaking pipe",
    });
  });

  it("uses controlled module targets for Petty Cash account and period activity", () => {
    expect(
      resolveActivityEntityTarget({
        entityId: id,
        entityType: "petty_cash_account",
        recordLabel: "Main cash box",
      }),
    ).toMatchObject({
      focusMode: "module",
      href: "/petty-cash",
    });
    expect(
      resolveActivityEntityTarget({
        entityId: id,
        entityType: "petty_cash_period",
        recordLabel: "July register",
      }),
    ).toMatchObject({
      focusMode: "module",
      href: "/petty-cash",
    });
  });

  it.each([
    ["accounting_journal_entry", "Accounting", "/ledger"],
    ["accounting_period", "Accounting", "/ledger"],
    ["organization", "Organization", "/settings?section=organization"],
    ["organization_branch", "Organization branch", "/settings?section=branches"],
    ["organization_invitation", "Organization access", "/settings?section=teams"],
    ["organization_membership", "Organization access", "/settings?section=teams"],
  ])("uses a safe module target for %s", (entityType, entityLabel, href) => {
    expect(
      resolveActivityEntityTarget({
        entityId: id,
        entityType,
        recordLabel: "Snapshot label",
      }),
    ).toMatchObject({
      entityLabel,
      focusMode: "module",
      href,
    });
  });

  it("classifies people lease backfills as explicitly unavailable", () => {
    const target = resolveActivityEntityTarget({
      entityId: id,
      entityType: "people_leases_backfill",
      recordLabel: "Lease relationship backfill",
    });

    expect(target).toEqual({
      actionLabel: "Source unavailable",
      entityLabel: "People leases backfill",
      focusMode: "unavailable",
      recordLabel: "Lease relationship backfill",
    });
  });

  it("does not use a display label as record identity", () => {
    const target = resolveActivityEntityTarget({
      entityId: id,
      entityType: "finance_income_item",
      recordLabel: "John Smith",
    });

    expect(target.href).toContain(`incomeItemId=${id}`);
    expect(target.href).not.toContain("John");
  });

  it("returns an unavailable target for unknown or malformed references", () => {
    expect(
      resolveActivityEntityTarget({
        entityId: id,
        entityType: "mystery_record",
        recordLabel: "Unknown",
      }),
    ).toEqual({
      actionLabel: "Source unavailable",
      entityLabel: "Mystery Record",
      focusMode: "unavailable",
      recordLabel: "Unknown",
    });

    const malformed = resolveActivityEntityTarget({
      entityId: "not-a-uuid",
      entityType: "ledger_entry",
      recordLabel: "Ledger entry",
    });

    expect(malformed).toMatchObject({ focusMode: "unavailable" });
    expect(malformed).not.toHaveProperty("href");
  });
});
