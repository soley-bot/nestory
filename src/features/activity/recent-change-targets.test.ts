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
  it("batches source checks and removes missing source labels, snapshots and links", async () => {
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
        {
          ledger_entries: [{ id: availableLedgerId }],
          tenant_requests: [{ id: requestId }],
        },
        calls,
      ),
    });

    expect(calls).toEqual([
      {
        ids: [availableLedgerId, missingLedgerId],
        organizationId,
        table: "ledger_entries",
      },
      {
        ids: [requestId],
        organizationId,
        table: "tenant_requests",
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
    expect(changes[1].details).toEqual([]);
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

  it("removes all unavailable snapshots, including financial details and nested free text", async () => {
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
            depositAmount: 987.65,
            depositCurrency: "USD",
            note: { privateText: "Private payment instruction" },
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

    expect(change.details).toEqual([]);
    expect(JSON.stringify(change)).not.toMatch(/Private|987\.65|USD|approved|draft/);
  });

  it.each([
    ["global", "/timeline"],
    ["property", "/property-timeline"],
    ["maintenance", "/maintenance-timeline"],
    ["financial", "/financial-timeline"],
  ] as const)("keeps available event activity inside the %s timeline route", async (timelineScope, pathname) => {
    const [available, unavailable] = await resolveRecentChangeTargets({
      logs: [
        activity("timeline_event", availableLedgerId, "Visible event"),
        activity("timeline_event", missingLedgerId, "Private event"),
      ],
      organizationId,
      supabase: createClient({ timeline_events: [{ id: availableLedgerId, event_type: "Maintenance", cost_amount: 10 }] }, []),
      timelineScopes: [timelineScope],
    });

    const href = `${pathname}?archiveState=all&eventId=${availableLedgerId}`;
    expect(available.href).toBe(href);
    expect(available.target).toMatchObject({ focusMode: "exact", href });
    expect(unavailable.href).toBeUndefined();
    expect(unavailable.target).toMatchObject({ focusMode: "unavailable", href: undefined });
    expect(unavailable.details).toEqual([]);
  });

  it.each([
    ["maintenance", "financial", "General Note", 25],
    ["financial", "maintenance", "Repair", null],
  ] as const)("routes %s recent activity to a matching permitted %s event scope", async (primary, alternate, eventType, costAmount) => {
    const [change] = await resolveRecentChangeTargets({
      logs: [activity("timeline_event", availableLedgerId, "Visible event")],
      organizationId,
      supabase: createClient({ timeline_events: [{ id: availableLedgerId, event_type: eventType, cost_amount: costAmount }] }, []),
      timelineScopes: [primary, alternate],
    });
    expect(change.target?.href).toBe(`/${alternate}-timeline?archiveState=all&eventId=${availableLedgerId}`);
  });

  it.each([
    { timelineScopes: [] },
    { timelineScopes: ["maintenance"] },
  ] as const)("does not fall back to the global timeline when permitted scopes $timelineScopes cannot show the event", async ({ timelineScopes }) => {
    const [change] = await resolveRecentChangeTargets({
      logs: [activity("timeline_event", availableLedgerId, "Visible lease event")],
      organizationId,
      supabase: createClient({ timeline_events: [{ id: availableLedgerId, event_type: "Lease Started", cost_amount: null }] }, []),
      timelineScopes,
    });
    expect(change.href).toBeUndefined();
    expect(change.target).toMatchObject({ focusMode: "unavailable", href: undefined });
    expect(change.details).toContainEqual(expect.objectContaining({ after: "Visible lease event" }));
  });

  it("preserves authorized lease details while hiding the same fields for an unavailable lease", async () => {
    const snapshot = { depositAmount: 987.65, depositCurrency: "USD", note: "Synthetic lease detail" };
    const [available, unavailable] = await resolveRecentChangeTargets({
      logs: [availableLedgerId, missingLedgerId].map((id) => ({
        ...activity("lease", id, "Lease"),
        new_values: snapshot,
        previous_values: { depositAmount: 500 },
      })),
      organizationId,
      supabase: createClient({ leases: [{ id: availableLedgerId }] }, []),
    });

    expect(JSON.stringify(available.details)).toContain("987.65");
    expect(JSON.stringify(available.details)).toContain("USD");
    expect(available.target?.focusMode).toBe("exact");
    expect(unavailable.details).toEqual([]);
    expect(unavailable.target?.focusMode).toBe("unavailable");
  });

  it("does not retain a maintenance request snapshot when its source is inaccessible", async () => {
    const [change] = await resolveRecentChangeTargets({
      logs: [{
        ...activity("tenant_request", requestId, "Private request"),
        new_values: { description: "Private repair details", estimated_cost: 987.65 },
      }],
      organizationId,
      supabase: createClient({ tenant_requests: [] }, []),
    });

    expect(change).toMatchObject({ details: [], href: undefined, target: { focusMode: "unavailable" } });
    expect(JSON.stringify(change)).not.toContain("Private");
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
  results: Record<string, Array<{ id: string; event_type?: string; cost_amount?: number | null }>>,
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
