import { beforeEach, describe, expect, it, vi } from "vitest";

const { createAssetPhotoAction, requirePermission, revalidatePath, rpc } =
  vi.hoisted(() => ({
    createAssetPhotoAction: vi.fn(),
    requirePermission: vi.fn(),
    revalidatePath: vi.fn(),
    rpc: vi.fn(),
  }));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/features/photos/actions", () => ({ createAssetPhotoAction }));
vi.mock("@/lib/auth/context", () => ({ requirePermission }));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: async () => ({ rpc }),
}));

import {
  archivePropertyAction,
  createPropertyAction,
  setPropertyRentalStructureAction,
  updatePropertyAction,
} from "@/features/properties/actions";

const organizationId = "00000000-0000-4000-8000-000000000001";
const branchId = "90000000-0000-4000-8000-000000000001";
const otherBranchId = "90000000-0000-4000-8000-000000000002";
const ownerPersonId = "80000000-0000-0000-0000-000000000004";
const propertyId = "10000000-0000-0000-0000-000000000001";

describe("property ownership authority inputs", () => {
  beforeEach(() => {
    createAssetPhotoAction.mockReset();
    requirePermission.mockReset();
    revalidatePath.mockReset();
    rpc.mockReset();
    requirePermission.mockResolvedValue({
      isSuperAdmin: true,
      organizationId,
    });
    rpc.mockResolvedValue({ data: propertyId, error: null });
  });

  it("creates basic property identity without requiring owner or status setup", async () => {
    const formData = new FormData();
    formData.set("address", "10 Riverside Road");
    formData.set("code", "");
    formData.set("branchId", branchId);
    formData.set("idempotencyKey", "property-create-0001");
    formData.set("name", "Riverside House");
    formData.set("propertyType", "House");
    formData.set("registeredDate", "2026-08-17");

    await expect(createPropertyAction({}, formData)).resolves.toMatchObject({
      propertyId,
      status: "success",
    });
    expect(rpc).toHaveBeenCalledWith("create_property_minimal", {
      p_address: "10 Riverside Road",
      p_branch_id: branchId,
      p_code: null,
      p_idempotency_key: "property-create-0001",
      p_name: "Riverside House",
      p_organization_id: organizationId,
      p_property_type: "House",
      p_registered_date: "2026-08-17",
    });
    expect(requirePermission).toHaveBeenCalledWith("properties.write");
  });

  it("uses the checked branch-aware overload for an ordinary writer", async () => {
    requirePermission.mockResolvedValue({
      branchId: "90000000-0000-4000-8000-000000000001",
      isSuperAdmin: false,
      organizationId,
    });
    const formData = new FormData();
    formData.set("address", "10 Riverside Road");
    formData.set("code", "");
    formData.set("branchId", otherBranchId);
    formData.set("idempotencyKey", "property-create-branch-0001");
    formData.set("name", "Riverside House");
    formData.set("propertyType", "House");
    formData.set("registeredDate", "2026-08-17");

    await createPropertyAction({}, formData);

    expect(rpc).toHaveBeenCalledWith(
      "create_property_minimal",
      expect.objectContaining({
        p_branch_id: "90000000-0000-4000-8000-000000000001",
      }),
    );
  });

  it("never falls back to an unscoped overload when ordinary branch scope is unavailable", async () => {
    requirePermission.mockResolvedValue({
      isSuperAdmin: false,
      organizationId,
    });
    const formData = propertyCreateForm();
    formData.set("branchId", otherBranchId);

    await expect(createPropertyAction({}, formData)).resolves.toMatchObject({
      fieldErrors: {
        branchId: ["Your branch access is unavailable."],
      },
      status: "error",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("creates the property and its owner link in one call when guided setup supplies ownership", async () => {
    const formData = new FormData();
    formData.set("address", "10 Riverside Road");
    formData.set("code", "");
    formData.set("branchId", branchId);
    formData.set("idempotencyKey", "property-create-0002");
    formData.set("name", "Riverside House");
    formData.set("ownerPersonId", ownerPersonId);
    formData.set("ownerStartedOn", "2026-08-01");
    formData.set("ownershipPercent", "100.000");
    formData.set("propertyType", "House");
    formData.set("registeredDate", "2026-08-17");

    await expect(createPropertyAction({}, formData)).resolves.toMatchObject({
      propertyId,
      status: "success",
    });
    expect(rpc).toHaveBeenCalledWith("create_property_minimal", {
      p_address: "10 Riverside Road",
      p_branch_id: branchId,
      p_code: null,
      p_idempotency_key: "property-create-0002",
      p_name: "Riverside House",
      p_organization_id: organizationId,
      p_owner_ownership_percent: "100.000",
      p_owner_person_id: ownerPersonId,
      p_owner_started_on: "2026-08-01",
      p_property_type: "House",
      p_registered_date: "2026-08-17",
    });
  });

  it("rejects a creation owner selection without an explicit effective start and share", async () => {
    const formData = new FormData();
    formData.set("code", "");
    formData.set("branchId", branchId);
    formData.set("idempotencyKey", "property-create-0003");
    formData.set("name", "Riverside House");
    formData.set("ownerPersonId", ownerPersonId);
    formData.set("propertyType", "House");
    formData.set("registeredDate", "2026-08-17");

    await expect(createPropertyAction({}, formData)).resolves.toMatchObject({
      fieldErrors: {
        ownerStartedOn: ["Enter the ownership start date."],
        ownershipPercent: ["Enter the ownership share."],
      },
      status: "error",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("requires an explicit branch when Super Admin creates a Property", async () => {
    const formData = propertyCreateForm();
    formData.delete("branchId");

    await expect(createPropertyAction({}, formData)).resolves.toMatchObject({
      fieldErrors: { branchId: ["Choose a branch."] },
      status: "error",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rejects a malformed Super Admin branch before the checked RPC", async () => {
    const formData = propertyCreateForm();
    formData.set("branchId", "not-a-branch");

    await expect(createPropertyAction({}, formData)).resolves.toMatchObject({
      fieldErrors: { branchId: ["Choose a branch."] },
      status: "error",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["inactive", "Branch is not active"],
    ["cross-organization", "Not authorized"],
  ])(
    "fails closed when the selected Super Admin branch is %s",
    async (_scope, message) => {
      rpc.mockResolvedValueOnce({ data: null, error: { message } });
      const formData = propertyCreateForm();
      formData.set("idempotencyKey", `property-create-${_scope}`);

      await expect(createPropertyAction({}, formData)).resolves.toMatchObject({
        status: "error",
      });

      expect(rpc).toHaveBeenCalledTimes(1);
      expect(rpc).toHaveBeenCalledWith(
        "create_property_minimal",
        expect.objectContaining({ p_branch_id: branchId }),
      );
    },
  );

  it("persists the explicit rental placement choice through the checked RPC", async () => {
    const formData = new FormData();
    formData.set("propertyId", propertyId);
    formData.set("rentalStructure", "single_space");

    await expect(
      setPropertyRentalStructureAction({}, formData),
    ).resolves.toMatchObject({
      message: "Whole-property leasing is ready.",
      propertyId,
      status: "success",
    });
    expect(rpc).toHaveBeenCalledWith("set_property_rental_structure", {
      p_organization_id: organizationId,
      p_property_id: propertyId,
      p_rental_structure: "single_space",
    });
  });

  it("rejects an owner selection without an explicit effective start and share", async () => {
    const formData = propertyForm();
    formData.set("ownerPersonId", ownerPersonId);

    await expect(updatePropertyAction({}, formData)).resolves.toMatchObject({
      fieldErrors: {
        ownerStartedOn: ["Enter the ownership start date."],
        ownershipPercent: ["Enter the ownership share."],
      },
      status: "error",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes actor-entered sole-owner authority from Property details without inventing facts", async () => {
    const formData = propertyForm();
    formData.set("ownerPersonId", ownerPersonId);
    formData.set("ownerStartedOn", "2026-08-01");
    formData.set("ownershipPercent", "100.000");

    await expect(updatePropertyAction({}, formData)).resolves.toMatchObject({
      propertyId,
      status: "success",
    });
    expect(rpc).toHaveBeenCalledWith("update_property_details", {
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
      p_property_id: propertyId,
      p_property_type: "Apartment",
      p_registered_date: null,
      p_status: "active",
    });
    expect(requirePermission).toHaveBeenCalledWith("properties.write");
  });

  it.each(["0", "-1", "100.001", "1.0000", "share"])(
    "rejects invalid explicit owner share %s before database access",
    async (share) => {
      const formData = propertyForm();
      formData.set("ownerPersonId", ownerPersonId);
      formData.set("ownerStartedOn", "2026-08-01");
      formData.set("ownershipPercent", share);

      await expect(updatePropertyAction({}, formData)).resolves.toMatchObject({
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

    await expect(updatePropertyAction({}, formData)).resolves.toMatchObject({
      status: "success",
    });
    expect(rpc).toHaveBeenCalledWith(
      "update_property_details",
      expect.objectContaining({ p_owner_ownership_percent: "60.000" }),
    );
  });

  it("does not send orphaned ownership metadata when no owner is selected", async () => {
    const formData = propertyForm();
    formData.set("ownerStartedOn", "2026-08-01");
    formData.set("ownershipPercent", "100.000");

    await expect(updatePropertyAction({}, formData)).resolves.toMatchObject({
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

  it("directs the operator to close open leases before archiving a property", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Property has an open Lease" },
    });
    const formData = new FormData();
    formData.set("propertyId", propertyId);

    await expect(archivePropertyAction({}, formData)).resolves.toEqual({
      message: "End or cancel open leases before archiving this property.",
      status: "error",
    });
    expect(requirePermission).toHaveBeenCalledWith("properties.archive");
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
  formData.set("propertyId", propertyId);
  formData.set("registeredDate", "");
  formData.set("status", "active");
  return formData;
}

function propertyCreateForm() {
  const formData = new FormData();
  formData.set("address", "10 Riverside Road");
  formData.set("branchId", branchId);
  formData.set("code", "");
  formData.set("idempotencyKey", "property-create-branch-choice");
  formData.set("name", "Riverside House");
  formData.set("propertyType", "House");
  formData.set("registeredDate", "2026-08-17");
  return formData;
}
