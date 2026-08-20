import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireSuperAdminContext, revalidatePath, rpc } = vi.hoisted(() => ({
  requireSuperAdminContext: vi.fn(),
  revalidatePath: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/auth/context", () => ({ requireSuperAdminContext }));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: async () => ({ rpc }),
}));

import { createPersonAction } from "@/features/people/actions";

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
