import { beforeEach, describe, expect, it, vi } from "vitest";

const { createAssetPhotoAction, requirePermission, requireWorkspaceContext, revalidatePath, rpc } =
  vi.hoisted(() => ({
    createAssetPhotoAction: vi.fn(),
    requirePermission: vi.fn(),
    requireWorkspaceContext: vi.fn(),
    revalidatePath: vi.fn(),
    rpc: vi.fn(),
  }));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/features/photos/actions", () => ({ createAssetPhotoAction }));
vi.mock("@/lib/auth/context", () => ({ requirePermission, requireWorkspaceContext }));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: async () => ({ rpc }),
}));

import {
  archivePropertyAction,
  createPropertyAction,
  setPropertyRentalStructureAction,
  updatePropertyAction,
} from "@/features/properties/actions";
import { invalidJpegFile } from "@/test-utils/upload-content";

const organizationId = "00000000-0000-4000-8000-000000000001";
const branchId = "90000000-0000-4000-8000-000000000001";
const otherBranchId = "90000000-0000-4000-8000-000000000002";
const ownerPersonId = "80000000-0000-0000-0000-000000000004";
const propertyId = "10000000-0000-0000-0000-000000000001";
const editVersion = "20000000-0000-4000-8000-000000000001";

describe("property ownership authority inputs", () => {
  beforeEach(() => {
    createAssetPhotoAction.mockReset();
    requirePermission.mockReset();
    requireWorkspaceContext.mockReset();
    requireWorkspaceContext.mockResolvedValue({ organizationId, permissionKeys: new Set(["properties.write"]) });
    revalidatePath.mockReset();
    rpc.mockReset();
    createAssetPhotoAction.mockResolvedValue({ status: "success" });
    requirePermission.mockResolvedValue({
      isSuperAdmin: true,
      organizationId,
    });
    rpc.mockImplementation(async (name) => ({
      data: name === "update_property_details_checked"
        ? { property_id: propertyId, version: editVersion, changed: true }
        : propertyId,
      error: null,
    }));
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

  it("rejects a spoofed inline photo before creating the Property", async () => {
    const formData = propertyCreateForm();
    formData.set("photo", invalidJpegFile("property.jpg"));

    await expect(createPropertyAction({}, formData)).resolves.toEqual({
      fieldErrors: { photo: ["Upload a JPG, PNG, or WebP photo."] },
      status: "error",
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(createAssetPhotoAction).not.toHaveBeenCalled();
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
    expect(rpc).toHaveBeenCalledWith("update_property_details_checked", {
      p_acquisition_date: null,
      p_address: null,
      p_code: "CTR",
      p_expected_version: editVersion,
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
    expect(requireWorkspaceContext).toHaveBeenCalledTimes(1);
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
      "update_property_details_checked",
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

  it("rejects a missing version before contacting the database", async () => {
    const formData = propertyForm();
    formData.delete("expectedVersion");
    expect(await updatePropertyAction({}, formData)).toMatchObject({
      status: "error", message: expect.stringContaining("latest version"),
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("keeps a revoked writer in the editor instead of redirecting away from the draft", async () => {
    requireWorkspaceContext.mockResolvedValueOnce({ organizationId, permissionKeys: new Set() });
    expect(await updatePropertyAction({}, propertyForm())).toMatchObject({ status: "error", message: expect.stringContaining("permission") });
    expect(rpc).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("does not invalidate or upload on a database-confirmed no-op", async () => {
    rpc.mockResolvedValueOnce({ data: { property_id: propertyId, version: editVersion, changed: false }, error: null });
    expect(await updatePropertyAction({}, propertyForm())).toMatchObject({
      status: "success", message: "No changes to save.", changed: false,
    });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(createAssetPhotoAction).not.toHaveBeenCalled();
  });

  it("invalidates affected property views once after a confirmed mutation", async () => {
    await updatePropertyAction({}, propertyForm());
    expect(revalidatePath.mock.calls).toEqual([
      ["/properties"], [`/properties/${propertyId}`], ["/overview"], ["/people"],
    ]);
  });

  it.each([
    ["Property changed since this editor was opened", "while you were editing"],
    ["Not authorized", "permission"],
    ["Property not found", "find that property"],
  ])("returns %s without invalidation or a fallback write", async (message, expected) => {
    rpc.mockResolvedValueOnce({ data: null, error: { message } });
    expect(await updatePropertyAction({}, propertyForm())).toMatchObject({
      status: "error", message: expect.stringContaining(expected),
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("uses only the authorized organization even if the submission spoofs it", async () => {
    const formData = propertyForm();
    formData.set("organizationId", "another-organization");
    await updatePropertyAction({}, formData);
    expect(rpc).toHaveBeenCalledWith("update_property_details_checked", expect.objectContaining({ p_organization_id: organizationId }));
  });

  it("allows retry after a lost response without inventing a new version", async () => {
    rpc.mockRejectedValueOnce(new Error("connection lost"));
    rpc.mockResolvedValueOnce({ data: { property_id: propertyId, version: "20000000-0000-4000-8000-000000000002", changed: false }, error: null });
    const formData = propertyForm();
    const first = await updatePropertyAction({}, formData);
    expect(first).toMatchObject({ status: "error", message: expect.stringContaining("confirm the save") });
    expect(await updatePropertyAction(first, formData)).toMatchObject({ status: "success", changed: false });
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1]);
    expect(revalidatePath.mock.calls).toEqual([
      ["/properties"], [`/properties/${propertyId}`], ["/overview"], ["/people"],
    ]);
  });

  it("fails closed on an unconfirmed database response", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null });
    expect(await updatePropertyAction({}, propertyForm())).toMatchObject({ status: "error" });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects inline edit photos before a property write", async () => {
    const formData = propertyForm();
    formData.set("photo", invalidJpegFile("property.jpg"));
    expect(await updatePropertyAction({}, formData)).toMatchObject({ status: "error", message: expect.stringContaining("Files tab") });
    expect(rpc).not.toHaveBeenCalled();
    expect(createAssetPhotoAction).not.toHaveBeenCalled();
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
  formData.set("expectedVersion", editVersion);
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
