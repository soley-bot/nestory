import { describe, expect, it } from "vitest";
import {
  resolveRecentChangeTargets,
  type ActivityTargetQueryClient,
} from "@/features/activity/recent-change-targets";
import type { ActivityLogSnapshot } from "@/features/activity/recent-changes";

const organizationId = "11111111-1111-4111-8111-111111111111";
const availableLedgerId = "22222222-2222-4222-8222-222222222222";
const missingLedgerId = "33333333-3333-4333-8333-333333333333";
const requestId = "44444444-4444-4444-8444-444444444444";

describe("resolveRecentChangeTargets", () => {
  it("batches encountered exact types and removes missing source labels and links", async () => {
    const calls: QueryCall[] = [];
    const changes = await resolveRecentChangeTargets({
      logs: [
        activity("ledger_entry", availableLedgerId, "Visible ledger label"),
        {
          ...activity("ledger_entry", missingLedgerId, "Private snapshot label"),
          new_values: {
            amount: 150,
            status: "posted",
            title: "Private snapshot label",
          },
          previous_values: {
            amount: 100,
            status: "draft",
            title: "Previous private label",
          },
        },
        activity("tenant_request", requestId, "Leaking pipe"),
      ],
      organizationId,
      supabase: createClient(
        { ledger_entries: [{ id: availableLedgerId }] },
        calls,
      ),
    });

    expect(calls).toEqual([
      {
        ids: [availableLedgerId, missingLedgerId],
        organizationId,
        table: "ledger_entries",
      },
    ]);
    expect(changes[0]).toMatchObject({
      href: `/ledger?archiveState=all&entryId=${availableLedgerId}`,
      recordLabel: "Visible ledger label",
      target: { focusMode: "exact" },
    });
    expect(changes[1]).toMatchObject({
      href: undefined,
      recordLabel: "Source record unavailable",
      target: {
        actionLabel: "Source unavailable",
        focusMode: "unavailable",
        href: undefined,
        recordLabel: "Source record unavailable",
      },
    });
    expect(changes[1].target?.recordLabel).not.toContain(
      "Private snapshot label",
    );
    expect(changes[1].details).not.toContainEqual(
      expect.objectContaining({ field: "Title" }),
    );
    expect(changes[1].details).toEqual(
      expect.arrayContaining([
        { after: "150", before: "100", field: "Amount" },
        { after: "posted", before: "draft", field: "Status" },
      ]),
    );
    expect(changes[2]).toMatchObject({
      href: "/maintenance?archiveState=all",
      recordLabel: "Leaking pipe",
      target: { focusMode: "module" },
    });
  });

  it("queries each encountered exact entity table once", async () => {
    const calls: QueryCall[] = [];

    await resolveRecentChangeTargets({
      logs: [
        activity(
          "finance_income_item",
          "55555555-5555-4555-8555-555555555555",
          "July rent",
        ),
        activity(
          "finance_expense_item",
          "66666666-6666-4666-8666-666666666666",
          "Valve",
        ),
        activity(
          "petty_cash_entry",
          "77777777-7777-4777-8777-777777777777",
          "Petty cash",
        ),
      ],
      organizationId,
      supabase: createClient(
        {
          finance_expense_items: [],
          finance_income_items: [],
          petty_cash_entries: [],
        },
        calls,
      ),
    });

    expect(calls.map((call) => call.table)).toEqual([
      "finance_income_items",
      "finance_expense_items",
      "petty_cash_entries",
    ]);
    expect(calls.every((call) => call.organizationId === organizationId)).toBe(
      true,
    );
  });

  it("removes every identity-label snapshot field from unavailable detail", async () => {
    const identityValues = {
      category: "Private category",
      display_name: "Private display name",
      entry_kind: "expense",
      expense_type: "maintenance",
      file_name: "private.pdf",
      income_type: "rent",
      name: "Private name",
      payer_label: "Private payer",
      tenant_name: "Private tenant",
      title: "Private title",
      unit_number: "12A",
      vendor_label: "Private vendor",
    };
    const previousIdentityValues = Object.fromEntries(
      Object.keys(identityValues).map((key) => [key, `Previous ${key}`]),
    );
    const [change] = await resolveRecentChangeTargets({
      logs: [
        {
          ...activity("finance_expense_item", missingLedgerId, "Private"),
          new_values: {
            ...identityValues,
            amount: 250,
            status: "approved",
          },
          previous_values: {
            ...previousIdentityValues,
            amount: 200,
            status: "draft",
          },
        },
      ],
      organizationId,
      supabase: createClient({ finance_expense_items: [] }, []),
    });

    expect(change.details.map((detail) => detail.field)).toEqual([
      "Amount",
      "Status",
    ]);
  });
});

function activity(
  entityType: string,
  entityId: string,
  title: string,
): ActivityLogSnapshot {
  return {
    action: "updated",
    created_at: "2026-07-23T09:00:00.000Z",
    entity_id: entityId,
    entity_type: entityType,
    id: `${entityId}-activity`,
    new_values: { title },
    previous_values: null,
  };
}

type QueryCall = {
  ids?: string[];
  organizationId?: string;
  table: string;
};

function createClient(
  results: Record<string, Array<{ id: string }>>,
  calls: QueryCall[],
): ActivityTargetQueryClient {
  return {
    from(table: string) {
      const call: QueryCall = { table };
      calls.push(call);
      const query = {
        eq(column: string, value: string) {
          if (column === "organization_id") {
            call.organizationId = value;
          }
          return query;
        },
        in(_column: string, ids: string[]) {
          call.ids = ids;
          return Promise.resolve({ data: results[table] ?? [], error: null });
        },
        select() {
          return query;
        },
      };
      return query;
    },
  };
}
