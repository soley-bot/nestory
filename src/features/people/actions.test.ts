import { beforeEach, describe, expect, it, vi } from "vitest";

const { from, requirePermission, revalidatePath, rpc } = vi.hoisted(() => ({
  from: vi.fn(),
  requirePermission: vi.fn(),
  revalidatePath: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth/context", () => ({ requirePermission }));
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
    requirePermission.mockReset();
    revalidatePath.mockReset();
    rpc.mockReset();
    requirePermission.mockResolvedValue({ isSuperAdmin: true, organizationId });
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
    expect(requirePermission).toHaveBeenCalledWith("people.write");
  });

  it("creates an ordinary writer's person and branch relationship atomically", async () => {
    const branchId = "90000000-0000-4000-8000-000000000001";
    requirePermission.mockResolvedValue({
      branchId,
      isSuperAdmin: false,
      organizationId,
    });
    const formData = new FormData();
    formData.set("creationScope", "branch");
    formData.set("displayName", "Branch Tenant");
    formData.set("partyType", "individual");
    formData.append("roles", "tenant");

    await createPersonAction({}, formData);

    expect(rpc).toHaveBeenCalledWith(
      "create_person",
      expect.objectContaining({ p_branch_id: branchId }),
    );
  });

  it("fails closed on standalone ordinary-user person creation", async () => {
    requirePermission.mockResolvedValue({
      branchId: "90000000-0000-4000-8000-000000000001",
      isSuperAdmin: false,
      organizationId,
    });
    const formData = new FormData();
    formData.set("displayName", "Unscoped Person");
    formData.set("partyType", "individual");
    formData.append("roles", "tenant");

    await expect(createPersonAction({}, formData)).resolves.toMatchObject({
      status: "error",
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("guided tenant archive", () => {
  const tenantPersonId = "80000000-0000-4000-8000-000000000001";
  const leaseId = "70000000-0000-4000-8000-000000000001";
  const occupancyId = "60000000-0000-4000-8000-000000000001";

  beforeEach(() => {
    from.mockReset();
    requirePermission.mockReset();
    revalidatePath.mockReset();
    rpc.mockReset();
    requirePermission.mockResolvedValue({ isSuperAdmin: true, organizationId });
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
    expect(requirePermission).toHaveBeenCalledWith("people.archive");
  });

  it("does not invoke lifecycle or archive RPCs while a current lease is linked", async () => {
    from.mockImplementation((table: string) => {
      if (table === "lease_parties") {
        return queryResult([
          {
            is_primary: true,
            lease_id: leaseId,
            party_role: "primary_tenant",
            person_id: tenantPersonId,
          },
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
    const result = await archiveTenantAction(
      {},
      archiveForm({ personId: tenantPersonId }),
    );

    expect(result).toMatchObject({
      message:
        "End or cancel the linked lease first, then return here to archive this tenant.",
      status: "error",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("keeps the tenant active without attempting a draft cancellation", async () => {
    from.mockImplementation((table: string) => {
      if (table === "lease_parties") {
        return queryResult([
          {
            is_primary: true,
            lease_id: leaseId,
            party_role: "primary_tenant",
            person_id: tenantPersonId,
          },
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
    const result = await archiveTenantAction(
      {},
      archiveForm({ personId: tenantPersonId }),
    );

    expect(result).toMatchObject({ status: "error" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("stops when the linked leases changed after the archive dialog opened", async () => {
    from.mockImplementation((table: string) => {
      if (table === "lease_parties") {
        return queryResult([
          {
            is_primary: true,
            lease_id: leaseId,
            party_role: "primary_tenant",
            person_id: tenantPersonId,
          },
        ]);
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await archiveTenantAction(
      {},
      archiveForm({ personId: tenantPersonId }),
    );

    expect(result).toMatchObject({
      message:
        "End or cancel the linked lease first, then return here to archive this tenant.",
      status: "error",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not terminate a lease when the person is a co-tenant", async () => {
    from.mockImplementation((table: string) => {
      if (table === "lease_parties") {
        return queryResult([
          {
            is_primary: false,
            lease_id: leaseId,
            party_role: "co_tenant",
            person_id: tenantPersonId,
          },
        ]);
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await archiveTenantAction(
      {},
      archiveForm({ personId: tenantPersonId }),
    );

    expect(result).toMatchObject({
      message:
        "End or cancel the linked lease first, then return here to archive this tenant.",
      status: "error",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not partially close multiple leases", async () => {
    const secondLeaseId = "70000000-0000-4000-8000-000000000002";
    from.mockImplementation((table: string) => {
      if (table === "lease_parties") {
        return queryResult([
          {
            is_primary: true,
            lease_id: leaseId,
            party_role: "primary_tenant",
            person_id: tenantPersonId,
          },
          {
            is_primary: true,
            lease_id: secondLeaseId,
            party_role: "primary_tenant",
            person_id: tenantPersonId,
          },
        ]);
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await archiveTenantAction(
      {},
      archiveForm({ personId: tenantPersonId }),
    );

    expect(result).toMatchObject({
      message:
        "End or cancel the linked lease first, then return here to archive this tenant.",
      status: "error",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("archives successfully after the current lease relationship is gone", async () => {
    let partyQueryCount = 0;
    from.mockImplementation((table: string) => {
      if (table === "lease_parties") {
        partyQueryCount += 1;
        if (partyQueryCount > 1) return queryResult([]);
        return queryResult([
          {
            is_primary: true,
            lease_id: leaseId,
            party_role: "primary_tenant",
            person_id: tenantPersonId,
          },
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
    rpc.mockResolvedValue({ data: tenantPersonId, error: null });

    const result = await archiveTenantAction(
      {},
      archiveForm({ personId: tenantPersonId }),
    );

    expect(result).toMatchObject({
      message:
        "End or cancel the linked lease first, then return here to archive this tenant.",
      status: "error",
    });
    expect(rpc).not.toHaveBeenCalled();

    await expect(
      archiveTenantAction({}, archiveForm({ personId: tenantPersonId })),
    ).resolves.toMatchObject({
      message: "Tenant archived.",
      status: "success",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("does not end a shared lease while another current party is attached", async () => {
    const otherPersonId = "80000000-0000-4000-8000-000000000002";
    let partyQueryCount = 0;
    from.mockImplementation((table: string) => {
      if (table === "lease_parties") {
        partyQueryCount += 1;
        return partyQueryCount === 1
          ? queryResult([
              {
                is_primary: true,
                lease_id: leaseId,
                party_role: "primary_tenant",
                person_id: tenantPersonId,
              },
            ])
          : queryResult([
              { lease_id: leaseId, person_id: tenantPersonId },
              { lease_id: leaseId, person_id: otherPersonId },
            ]);
      }
      throw new Error(`Unexpected table: ${table}`);
    });

    const result = await archiveTenantAction(
      {},
      archiveForm({ personId: tenantPersonId }),
    );

    expect(result).toMatchObject({
      message:
        "End or cancel the linked lease first, then return here to archive this tenant.",
      status: "error",
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});

function archiveForm({ personId }: { personId: string }) {
  const formData = new FormData();
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
