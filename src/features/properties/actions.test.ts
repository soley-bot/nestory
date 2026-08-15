import { beforeEach, describe, expect, it, vi } from "vitest";

const { createAssetPhotoAction, requireSuperAdminContext, revalidatePath, rpc } =
  vi.hoisted(() => ({
    createAssetPhotoAction: vi.fn(),
    requireSuperAdminContext: vi.fn(),
    revalidatePath: vi.fn(),
    rpc: vi.fn(),
  }));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/features/photos/actions", () => ({ createAssetPhotoAction }));
vi.mock("@/lib/auth/context", () => ({ requireSuperAdminContext }));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: async () => ({ rpc }),
}));

import {
  createPropertyAction,
  updatePropertyAction,
} from "@/features/properties/actions";

const organizationId = "00000000-0000-4000-8000-000000000001";
const ownerPersonId = "80000000-0000-0000-0000-000000000004";
const propertyId = "10000000-0000-0000-0000-000000000001";

describe("property ownership authority inputs", () => {
  beforeEach(() => {
    createAssetPhotoAction.mockReset();
    requireSuperAdminContext.mockReset();
    revalidatePath.mockReset();
    rpc.mockReset();
    requireSuperAdminContext.mockResolvedValue({ organizationId });
    rpc.mockResolvedValue({ data: propertyId, error: null });
  });

  it("rejects an owner selection without an explicit effective start and share", async () => {
    const formData = propertyForm();
    formData.set("ownerPersonId", ownerPersonId);

    await expect(createPropertyAction({}, formData)).resolves.toMatchObject({
      fieldErrors: {
        ownerStartedOn: ["Enter the ownership start date."],
        ownershipPercent: ["Enter the ownership share."],
      },
      status: "error",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes actor-entered sole-owner authority without inventing a date or 100 percent", async () => {
    const formData = propertyForm();
    formData.set("ownerPersonId", ownerPersonId);
    formData.set("ownerStartedOn", "2026-08-01");
    formData.set("ownershipPercent", "100.000");

    await expect(createPropertyAction({}, formData)).resolves.toMatchObject({
      propertyId,
      status: "success",
    });
    expect(rpc).toHaveBeenCalledWith("create_property", {
      p_acquisition_date: null,
      p_address: null,
      p_code: "CTR",
      p_name: "Central Residence",
      p_notes: null,
      p_organization_id: organizationId,
      p_owner: null,
      p_owner_ownership_percent: "100.000",
      p_owner_person_id: ownerPersonId,
      p_owner_started_on: "2026-08-01",
      p_property_type: "Apartment",
      p_status: "active",
    });
  });

  it.each(["0", "-1", "100.001", "1.0000", "share"])(
    "rejects invalid explicit owner share %s before database access",
    async (share) => {
      const formData = propertyForm();
      formData.set("ownerPersonId", ownerPersonId);
      formData.set("ownerStartedOn", "2026-08-01");
      formData.set("ownershipPercent", share);

      await expect(createPropertyAction({}, formData)).resolves.toMatchObject({
        fieldErrors: { ownershipPercent: expect.any(Array) },
        status: "error",
      });
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it("allows an explicitly entered incomplete multi-owner share for readiness remediation", async () => {
    const formData = propertyForm();
    formData.set("ownerPersonId", ownerPersonId);
    formData.set("ownerStartedOn", "2026-08-01");
    formData.set("ownershipPercent", "60.000");

    await expect(createPropertyAction({}, formData)).resolves.toMatchObject({
      status: "success",
    });
    expect(rpc).toHaveBeenCalledWith(
      "create_property",
      expect.objectContaining({ p_owner_ownership_percent: "60.000" }),
    );
  });

  it("does not send orphaned ownership metadata when no owner is selected", async () => {
    const formData = propertyForm();
    formData.set("ownerStartedOn", "2026-08-01");
    formData.set("ownershipPercent", "100.000");

    await expect(createPropertyAction({}, formData)).resolves.toMatchObject({
      fieldErrors: { ownerPersonId: ["Choose an owner for these ownership details."] },
      status: "error",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps a same-day zero-length replacement to an actionable ownership error", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: "Ownership replacement would create an empty interval" },
    });
    const formData = propertyForm();
    formData.set("propertyId", propertyId);
    formData.set("ownerPersonId", ownerPersonId);
    formData.set("ownerStartedOn", "2026-08-01");
    formData.set("ownershipPercent", "100.000");

    await expect(updatePropertyAction({}, formData)).resolves.toEqual({
      message:
        "Choose a later ownership start date or correct the never-effective owner record first.",
      status: "error",
    });
    expect(rpc.mock.calls.at(-1)?.[1]).not.toHaveProperty("p_owner_mode");
  });
});

function propertyForm() {
  const formData = new FormData();
  formData.set("acquisitionDate", "");
  formData.set("address", "");
  formData.set("code", "CTR");
  formData.set("name", "Central Residence");
  formData.set("notes", "");
  formData.set("owner", "");
  formData.set("ownerPersonId", "");
  formData.set("ownerStartedOn", "");
  formData.set("ownershipPercent", "");
  formData.set("propertyType", "Apartment");
  formData.set("status", "active");
  return formData;
}
