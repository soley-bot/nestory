import { beforeEach, describe, expect, it, vi } from "vitest";

const { createSupabaseServerClient, getPersonSelectOptions } = vi.hoisted(
  () => ({
    createSupabaseServerClient: vi.fn(),
    getPersonSelectOptions: vi.fn().mockResolvedValue([]),
  }),
);

vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient }));
vi.mock("@/features/people/data/person-options", () => ({
  getPersonSelectOptions,
}));

import { getLeasesScreenData } from "@/features/leases/data/leases";
import { parseLeaseSearchParams } from "@/features/leases/lease.filters";

type QueryError = {
  code: string;
  details: string;
  hint: string;
  message: string;
};

type QueryResult = {
  count: number | null;
  data: unknown;
  error: QueryError | null;
  status: number;
  statusText: string;
};

const organizationId = "10000000-0000-4000-8000-000000000001";
const propertyId = "20000000-0000-4000-8000-000000000001";
const tenantId = "30000000-0000-4000-8000-000000000001";

describe("lease screen data readiness", () => {
  beforeEach(() => {
    createSupabaseServerClient.mockReset();
    getPersonSelectOptions.mockClear();
  });

  it("loads named leases and term history when whole-domain related reads are denied", async () => {
    // Break caught: joining domain-filtered People/Properties/terms hides a permitted Lease.
    const rows = leaseRows(1);
    const { client } = leaseLoaderStub({ rows, scopedOnly: true });
    createSupabaseServerClient.mockResolvedValue(client);

    const result = await getLeasesScreenData(organizationId, parseLeaseSearchParams({}));

    expect(result.pagination.totalCount).toBe(1);
    expect(result.leases[0]).toMatchObject({
      tenantName: "Tenant 1", propertyName: "Pilot Property", unitLabel: "Whole property",
      terms: [expect.objectContaining({ id: "term-1" })],
      parties: [expect.objectContaining({ label: "Tenant 1" })],
    });
  });

  it("uses scoped readiness for a focused lease without finance authority context", async () => {
    // Break caught: the legacy readiness resolver throws 42501 after the list starts working.
    const rows = leaseRows(1);
    const { client } = leaseLoaderStub({ rows, scopedOnly: true });
    createSupabaseServerClient.mockResolvedValue(client);
    const result = await getLeasesScreenData(organizationId, parseLeaseSearchParams({ leaseId: rows[0].id }));
    expect(result.leases[0]?.rentReadiness.status).toBe("ready");
  });

  it("shows 60 held after 100 received and 40 refunded when direct deposit events are denied", async () => {
    // Break caught: populated deposit metadata plus RLS-empty direct events fabricates a zero held balance.
    const rows = leaseRows(1);
    rows[0].id = "9603a15b-8b35-47e1-90f5-f10f647ebba5";
    const { client } = leaseLoaderStub({ rows, scopedOnly: true, fundedDeposit: true });
    createSupabaseServerClient.mockResolvedValue(client);
    const result = await getLeasesScreenData(organizationId, parseLeaseSearchParams({ leaseId: rows[0].id }));
    expect(result.leases[0]?.deposits).toEqual([expect.objectContaining({
      id: "e57c9acf-a035-4ac9-a858-236d9709d5c1", amount: 850,
      receivedAmount: 100, heldBalance: 60, heldBalanceCents: 6000, statusLabel: "Partially held",
      events: [
        expect.objectContaining({ eventType: "refunded", amountDisplay: { primary: "USD 40.00" } }),
        expect.objectContaining({ eventType: "received", amountDisplay: { primary: "USD 100.00" } }),
      ],
    })]);
  });

  it("merges duplicate deposit event IDs once and preserves independently authorized references", async () => {
    const rows = leaseRows(1);
    const { client } = leaseLoaderStub({ rows, fundedDeposit: true, directDepositEvents: [
      { id: "receipt-1", lease_deposit_id: "e57c9acf-a035-4ac9-a858-236d9709d5c1", event_type: "received", event_date: "2026-09-01", amount: 100, currency: "USD", reference: "Authorized receipt reference", reversal_of_id: null },
    ] });
    createSupabaseServerClient.mockResolvedValue(client);
    const result = await getLeasesScreenData(organizationId);
    expect(result.leases[0]?.deposits[0]).toMatchObject({
      heldBalance: 60, receivedAmount: 100,
      events: [expect.objectContaining({ id: "refund-1" }), expect.objectContaining({ id: "receipt-1", reference: "Authorized receipt reference" })],
    });
  });

  it.each([null, {}, { properties: null }])("rejects malformed scoped context %j", async (context) => {
    const { client } = leaseLoaderStub({ rows: leaseRows(1), contextResult: ok(context) });
    createSupabaseServerClient.mockResolvedValue(client);
    await expect(getLeasesScreenData(organizationId)).rejects.toThrow(/lease read context/i);
  });

  it.each([null, {}, [{ id: "missing-term-fields" }]])("rejects malformed lease list %j", async (data) => {
    const { client } = leaseLoaderStub({ rows: leaseRows(1), listResult: ok(data, 1) });
    createSupabaseServerClient.mockResolvedValue(client);
    await expect(getLeasesScreenData(organizationId)).rejects.toThrow(/leases.*malformed/i);
  });

  it("keeps a missing scoped RPC fatal", async () => {
    const { client } = leaseLoaderStub({ rows: leaseRows(1), contextResult: {
      ...ok(null), error: { code: "PGRST202", details: "", hint: "", message: "Could not find get_lease_read_context" },
    } });
    createSupabaseServerClient.mockResolvedValue(client);
    await expect(getLeasesScreenData(organizationId)).rejects.toThrow(/Could not find get_lease_read_context/);
  });

  it("keeps a 50-row register neutral without launching readiness RPCs", async () => {
    const rows = leaseRows(50);
    const { client, readinessRpc } = leaseLoaderStub({ rows });
    createSupabaseServerClient.mockResolvedValue(client);

    const result = await getLeasesScreenData(
      organizationId,
      parseLeaseSearchParams({}),
    );

    expect(result.leases).toHaveLength(50);
    expect(readinessRpc).not.toHaveBeenCalled();
    expect(result.leases.every((lease) =>
      lease.rentReadiness.status === "unknown" &&
      lease.rentReadiness.reasonCode === "readiness_not_checked"
    )).toBe(true);
  });

  it("resolves readiness exactly once for a focused lease", async () => {
    const [lease] = leaseRows(1);
    const { client, readinessRpc } = leaseLoaderStub({ rows: [lease] });
    createSupabaseServerClient.mockResolvedValue(client);

    const result = await getLeasesScreenData(
      organizationId,
      parseLeaseSearchParams({ leaseId: lease.id }),
    );

    expect(result.leases[0]?.rentReadiness.status).toBe("ready");
    expect(readinessRpc).toHaveBeenCalledTimes(1);
    expect(readinessRpc).toHaveBeenCalledWith(
      "get_scoped_lease_rent_readiness",
      expect.objectContaining({
        p_lease_id: lease.id,
        p_organization_id: organizationId,
      }),
    );
  });

  it("keeps a focused lease usable when readiness has a strict transport failure", async () => {
    const [lease] = leaseRows(1);
    const { client } = leaseLoaderStub({
      readinessResult: {
        count: null,
        data: null,
        error: {
          code: "",
          details: "TypeError: fetch failed",
          hint: "",
          message: "TypeError: fetch failed",
        },
        status: 0,
        statusText: "",
      },
      rows: [lease],
    });
    createSupabaseServerClient.mockResolvedValue(client);

    const result = await getLeasesScreenData(
      organizationId,
      parseLeaseSearchParams({ leaseId: lease.id }),
    );

    expect(result.leases[0]?.rentReadiness).toMatchObject({
      reasonCode: "readiness_not_checked",
      status: "unknown",
      tone: "neutral",
    });
  });

  it.each([null, [], [{}]])("rejects malformed successful readiness %j", async (data) => {
    const rows = leaseRows(1);
    const { client } = leaseLoaderStub({ rows, readinessResult: ok(data) });
    createSupabaseServerClient.mockResolvedValue(client);
    await expect(getLeasesScreenData(organizationId, parseLeaseSearchParams({ leaseId: rows[0].id }))).rejects.toThrow(/readiness.*malformed/i);
  });

  it.each([
    ["permission", 403, "42501"],
    ["PostgREST", 400, "PGRST100"],
    ["HTTP service", 503, "PGRST002"],
    ["database", 500, "XX000"],
  ])("keeps %s readiness failures fatal", async (label, status, code) => {
    const [lease] = leaseRows(1);
    const { client } = leaseLoaderStub({
      readinessResult: {
        count: null,
        data: null,
        error: {
          code,
          details: `${label} details`,
          hint: `${label} hint`,
          message: `${label} failure`,
        },
        status,
        statusText: label,
      },
      rows: [lease],
    });
    createSupabaseServerClient.mockResolvedValue(client);

    await expect(
      getLeasesScreenData(
        organizationId,
        parseLeaseSearchParams({ leaseId: lease.id }),
      ),
    ).rejects.toThrow(
      `Could not resolve lease rent readiness: ${label} failure`,
    );
  });
});

function leaseLoaderStub({
  readinessResult,
  rows,
  scopedOnly = false,
  contextResult,
  listResult,
  fundedDeposit = false,
  directDepositEvents = [],
}: {
  readinessResult?: QueryResult;
  rows: ReturnType<typeof leaseRows>;
  scopedOnly?: boolean;
  contextResult?: QueryResult;
  listResult?: QueryResult;
  fundedDeposit?: boolean;
  directDepositEvents?: Array<Record<string, unknown>>;
}) {
  const readinessRpc = vi.fn(
    (name: string, args: Record<string, unknown>) => {
      void name;
      void args;

      return query(
        readinessResult ??
          ok([
            {
              policy_id: null,
              reason_code: "ready",
              readiness_status: "ready",
              repair_context: {
                termId: "40000000-0000-4000-8000-000000000001",
              },
              term_id: "40000000-0000-4000-8000-000000000001",
            },
          ]),
      );
    },
  );
  const rpc = vi.fn((name: string, args: Record<string, unknown>) => {
    if (name === "get_lease_read_context") {
      return query(contextResult ?? ok({
        properties: [{ archived_at: null, code: "PILOT", id: propertyId, name: "Pilot Property", rental_structure: "single_space" }],
        units: [], availability_leases: [], availability_terms: [],
        people: [{ id: tenantId, display_name: "Tenant 1" }],
        parties: scopedOnly ? [{ id: "party-1", lease_id: rows[0].id, person_id: tenantId, party_role: "tenant", is_primary: true, started_on: "2026-08-01", ended_on: null, archived_at: null }] : [],
        terms: scopedOnly ? [{ id: "term-1", lease_id: rows[0].id, term_sequence: 1, start_date: "2026-08-01", end_date: "2027-07-31", rent_amount: 500, rent_currency: "USD", rent_due_day: 1, payment_frequency: "monthly", status: "active", archived_at: null }] : [],
        billing_terms: [], occupancies: [],
        deposits: fundedDeposit ? [{ id: "e57c9acf-a035-4ac9-a858-236d9709d5c1", lease_id: rows[0].id, deposit_type: "security", amount: 850, currency: "USD", status: "partially_returned", archived_at: null }] : [],
        deposit_events: fundedDeposit ? [
          { id: "refund-1", lease_deposit_id: "e57c9acf-a035-4ac9-a858-236d9709d5c1", event_type: "refunded", event_date: "2026-09-02", amount: 40, currency: "USD", reference: null, reversal_of_id: null },
          { id: "receipt-1", lease_deposit_id: "e57c9acf-a035-4ac9-a858-236d9709d5c1", event_type: "received", event_date: "2026-09-01", amount: 100, currency: "USD", reference: null, reversal_of_id: null },
        ] : [],
      }));
    }
    if (name === "get_scoped_leases_with_effective_rent") return query(listResult ?? ok(rows, rows.length));
    if (name === "get_scoped_lease_rent_readiness") return readinessRpc(name, args);
    if (name === "get_leases_with_effective_rent") {
      return query(ok(scopedOnly ? [] : rows, scopedOnly ? 0 : rows.length));
    }
    if (name === "resolve_lease_rent_readiness") {
      return readinessRpc(name, args);
    }
    throw new Error(`Unexpected RPC: ${name}`);
  });
  const tableResults: Record<string, QueryResult> = {
    activity_logs: ok([]),
    documents: ok([]),
    lease_activation_schedules: ok([]),
    lease_billing_terms: ok([]),
    lease_deposits: ok([]),
    lease_deposit_events: ok(directDepositEvents),
    lease_occupancies: ok([]),
    lease_parties: ok([]),
    lease_terms: ok([]),
    leases: ok([]),
    ledger_entries: ok([]),
    organizations: ok({
      name: "Pilot",
      operational_timezone: "Asia/Phnom_Penh",
    }),
    people: ok([]),
    properties: ok([
      {
        archived_at: null,
        code: "PILOT",
        id: propertyId,
        name: "Pilot Property",
        rental_structure: "single_space",
      },
    ]),
    timeline_events: ok([]),
    units: ok([]),
  };
  const from = vi.fn((table: string) =>
    query(scopedOnly && ["properties", "units", "people", "lease_terms"].includes(table) ? ok([]) : tableResults[table] ?? ok([])),
  );

  return {
    client: { from, rpc },
    readinessRpc,
  };
}

function leaseRows(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    archived_at: null,
    deposit_amount: null,
    deposit_currency: null,
    id: `50000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    lease_end_date: "2027-07-31",
    lease_start_date: "2026-08-01",
    monthly_rent_amount: 500 + index,
    monthly_rent_currency: "USD",
    primary_tenant_person_id: tenantId,
    property_id: propertyId,
    status: "active",
    tenant_name: `Tenant ${index + 1}`,
    unit_id: null,
  }));
}

function ok(data: unknown, count: number | null = null): QueryResult {
  return {
    count,
    data,
    error: null,
    status: 200,
    statusText: "OK",
  };
}

function query(result: QueryResult) {
  const builder = {
    eq: vi.fn(() => builder),
    gte: vi.fn(() => builder),
    in: vi.fn(() => builder),
    is: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    lt: vi.fn(() => builder),
    maybeSingle: vi.fn(() => builder),
    not: vi.fn(() => builder),
    or: vi.fn(() => builder),
    order: vi.fn(() => builder),
    range: vi.fn(() => builder),
    select: vi.fn(() => builder),
    single: vi.fn(() => builder),
    then: (
      resolve: (value: QueryResult) => unknown,
      reject?: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };

  return builder;
}
