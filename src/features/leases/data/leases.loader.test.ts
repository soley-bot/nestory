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
      "resolve_lease_rent_readiness",
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
}: {
  readinessResult?: QueryResult;
  rows: ReturnType<typeof leaseRows>;
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
    if (name === "get_leases_with_effective_rent") {
      return query(ok(rows, rows.length));
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
    query(tableResults[table] ?? ok([])),
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
