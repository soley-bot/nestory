import { beforeEach, describe, expect, it, vi } from "vitest";

const { from, requireSuperAdminContext, revalidatePath, rpc } = vi.hoisted(() => ({
  from: vi.fn(),
  requireSuperAdminContext: vi.fn(),
  revalidatePath: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth/context", () => ({ requireSuperAdminContext }));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: async () => ({ from, rpc }),
}));

import {
  archiveTenantAction,
  createPersonAction,
} from "@/features/people/actions";

const organizationId = "00000000-0000-4000-8000-000000000001";
const personId = "80000000-0000-0000-0000-000000000001";

describe("person travel document inputs", () => {
  beforeEach(() => {
    requireSuperAdminContext.mockReset();
    revalidatePath.mockReset();
    rpc.mockReset();
    requireSuperAdminContext.mockResolvedValue({ organizationId });
    rpc.mockResolvedValue({ data: personId, error: null });
  });

  it("persists passport and optional visa expiry data with an owner", async () => {
    const formData = new FormData();
    formData.set("displayName", "Sokha Chan");
    formData.set("legalName", "Sokha Chan");
    formData.set("notes", "Renewal follow-up required");
    formData.set("partyType", "individual");
    formData.set("passportNumber", "P1234567");
    formData.set("passportExpiryDate", "2027-08-20");
    formData.set("primaryEmail", "sokha@example.test");
    formData.set("primaryPhone", "+855 12 345 678");
    formData.append("roles", "owner");
    formData.set("taxIdentifier", "TIN-123");
    formData.set("visaExpiryDate", "2026-12-31");

    await expect(createPersonAction({}, formData)).resolves.toMatchObject({
      personId,
      status: "success",
    });
    expect(rpc).toHaveBeenCalledWith("create_person", {
      p_display_name: "Sokha Chan",
      p_legal_name: "Sokha Chan",
      p_notes: "Renewal follow-up required",
      p_organization_id: organizationId,
      p_party_type: "individual",
      p_passport_expiry_date: "2027-08-20",
      p_passport_number: "P1234567",
      p_primary_email: "sokha@example.test",
      p_primary_phone: "+855 12 345 678",
      p_roles: ["owner"],
      p_tax_identifier: "TIN-123",
      p_visa_expiry_date: "2026-12-31",
    });
  });
});

describe("guided tenant archive", () => {
  const tenantPersonId = "80000000-0000-4000-8000-000000000001";
  const leaseId = "70000000-0000-4000-8000-000000000001";
  const occupancyId = "60000000-0000-4000-8000-000000000001";

  beforeEach(() => {
    from.mockReset();
    requireSuperAdminContext.mockReset();
    revalidatePath.mockReset();
    rpc.mockReset();
    requireSuperAdminContext.mockResolvedValue({ organizationId });
  });

  it("archives an unlinked tenant without invoking a lease transition", async () => {
    from.mockImplementation((table: string) => {
      if (table === "lease_parties") return queryResult([]);
      throw new Error(`Unexpected table: ${table}`);
    });
    rpc.mockResolvedValue({ data: tenantPersonId, error: null });

    const result = await archiveTenantAction(
      {},
      archiveForm({ personId: tenantPersonId }),
    );

    expect(result).toMatchObject({ status: "success" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("archive_person", {
      p_organization_id: organizationId,
      p_person_id: tenantPersonId,
    });
  });

  it("ends the linked tenancy before archiving without deleting its history", async () => {
    from.mockImplementation((table: string) => {
      if (table === "lease_parties") {
        return queryResult([
          { is_primary: true, lease_id: leaseId, party_role: "primary_tenant" },
        ]);
      }
      if (table === "leases") {
        return queryResult([{ id: leaseId, status: "active" }]);
      }
      if (table === "lease_occupancies") {
        return queryResult([
          {
            evidence_state: "accepted",
            id: occupancyId,
            lease_id: leaseId,
          },
        ]);
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    rpc
      .mockResolvedValueOnce({ data: { leaseId }, error: null })
      .mockResolvedValueOnce({ data: tenantPersonId, error: null });

    const result = await archiveTenantAction(
      {},
      archiveForm({
        leaseIds: [leaseId],
        note: "Keys returned",
        personId: tenantPersonId,
      }),
    );

    expect(result).toMatchObject({
      message: "Tenancy ended and tenant archived.",
      status: "success",
    });
    expect(rpc).toHaveBeenNthCalledWith(1, "transition_lease_lifecycle", {
      p_effective_date: "2026-08-20",
      p_expected_occupancy_id: occupancyId,
      p_expected_status: "active",
      p_idempotency_key: `archive-tenant:${tenantPersonId}:${leaseId}:2026-08-20`,
      p_lease_id: leaseId,
      p_organization_id: organizationId,
      p_reason: "Tenant archived from person record. Keys returned",
      p_scheduled_move_out_date: null,
      p_transition: "terminate",
    });
    expect(rpc).toHaveBeenNthCalledWith(2, "archive_person", {
      p_organization_id: organizationId,
      p_person_id: tenantPersonId,
    });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "transition_lease_lifecycle",
      "archive_person",
    ]);
  });

  it("keeps the tenant active when the lease transition fails", async () => {
    from.mockImplementation((table: string) => {
      if (table === "lease_parties") {
        return queryResult([
          { is_primary: true, lease_id: leaseId, party_role: "primary_tenant" },
        ]);
      }
      if (table === "leases") return queryResult([{ id: leaseId, status: "draft" }]);
      if (table === "lease_occupancies") {
        return queryResult([
          { evidence_state: "accepted", id: occupancyId, lease_id: leaseId },
        ]);
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    rpc.mockResolvedValue({
      data: null,
      error: { message: "relationship transition failed" },
    });

    const result = await archiveTenantAction(
      {},
      archiveForm({ leaseIds: [leaseId], personId: tenantPersonId }),
    );

    expect(result).toMatchObject({ status: "error" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalledWith("archive_person", expect.anything());
  });

  it("stops when the linked leases changed after the archive dialog opened", async () => {
    from.mockImplementation((table: string) => {
      if (table === "lease_parties") {
        return queryResult([
          { is_primary: true, lease_id: leaseId, party_role: "primary_tenant" },
        ]);
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await archiveTenantAction(
      {},
      archiveForm({ personId: tenantPersonId }),
    );

    expect(result).toMatchObject({
      message: "The tenant's linked leases changed. Refresh and try again.",
      status: "error",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not terminate a lease when the person is a co-tenant", async () => {
    from.mockImplementation((table: string) => {
      if (table === "lease_parties") {
        return queryResult([
          { is_primary: false, lease_id: leaseId, party_role: "co_tenant" },
        ]);
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await archiveTenantAction(
      {},
      archiveForm({ leaseIds: [leaseId], personId: tenantPersonId }),
    );

    expect(result).toMatchObject({
      message: "Change the primary tenant on the linked lease before archiving this person.",
      status: "error",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not partially close multiple leases", async () => {
    const secondLeaseId = "70000000-0000-4000-8000-000000000002";
    from.mockImplementation((table: string) => {
      if (table === "lease_parties") {
        return queryResult([
          { is_primary: true, lease_id: leaseId, party_role: "primary_tenant" },
          {
            is_primary: true,
            lease_id: secondLeaseId,
            party_role: "primary_tenant",
          },
        ]);
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await archiveTenantAction(
      {},
      archiveForm({
        leaseIds: [leaseId, secondLeaseId],
        personId: tenantPersonId,
      }),
    );

    expect(result).toMatchObject({
      message: "Review each open lease before archiving this tenant.",
      status: "error",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reports the safe retry when archiving fails after the tenancy ended", async () => {
    let partyQueryCount = 0;
    from.mockImplementation((table: string) => {
      if (table === "lease_parties") {
        partyQueryCount += 1;
        if (partyQueryCount > 1) return queryResult([]);
        return queryResult([
          { is_primary: true, lease_id: leaseId, party_role: "primary_tenant" },
        ]);
      }
      if (table === "leases") {
        return queryResult([{ id: leaseId, status: "active" }]);
      }
      if (table === "lease_occupancies") {
        return queryResult([
          { evidence_state: "accepted", id: occupancyId, lease_id: leaseId },
        ]);
      }
      throw new Error(`Unexpected table: ${table}`);
    });
    rpc
      .mockResolvedValueOnce({ data: { leaseId }, error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { message: "archive failed" },
      })
      .mockResolvedValueOnce({ data: tenantPersonId, error: null });

    const result = await archiveTenantAction(
      {},
      archiveForm({ leaseIds: [leaseId], personId: tenantPersonId }),
    );

    expect(result).toMatchObject({
      message: "The tenancy ended, but the tenant was not archived. Refresh and choose Archive again.",
      status: "error",
    });
    expect(rpc).toHaveBeenCalledTimes(2);

    await expect(
      archiveTenantAction({}, archiveForm({ personId: tenantPersonId })),
    ).resolves.toMatchObject({
      message: "Tenant archived.",
      status: "success",
    });
    expect(rpc).toHaveBeenCalledTimes(3);
  });
});

function archiveForm({
  leaseIds = [],
  note = "",
  personId,
}: {
  leaseIds?: string[];
  note?: string;
  personId: string;
}) {
  const formData = new FormData();
  formData.set("effectiveDate", "2026-08-20");
  for (const leaseId of leaseIds) formData.append("leaseId", leaseId);
  formData.set("note", note);
  formData.set("personId", personId);
  return formData;
}

function queryResult(data: unknown[], error: { message: string } | null = null) {
  const result = { data, error };
  const builder: Record<string, unknown> = {
    then: (
      resolve: (value: typeof result) => unknown,
      reject: (reason: unknown) => unknown,
    ) => Promise.resolve(result).then(resolve, reject),
  };

  for (const method of ["eq", "in", "is", "order", "select"]) {
    builder[method] = vi.fn(() => builder);
  }

  return builder;
}
