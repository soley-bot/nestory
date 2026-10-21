import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createDocumentAction,
  eq,
  from,
  maybeSingle,
  requirePermission,
  revalidatePath,
  rpc,
  select,
} = vi.hoisted(() => {
  const maybeSingle = vi.fn();
  const eq = vi.fn(() => ({ eq, maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));

  return {
    createDocumentAction: vi.fn(),
    eq,
    from,
    maybeSingle,
    requirePermission: vi.fn(),
    revalidatePath: vi.fn(),
    rpc: vi.fn(),
    select,
  };
});

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/features/documents/actions", () => ({ createDocumentAction }));
vi.mock("@/lib/auth/context", () => ({ requirePermission }));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: async () => ({ from, rpc }),
}));

import {
  archiveUnitAction,
  createUnitAction,
  restoreUnitAction,
  updateUnitAction,
} from "@/features/units/actions";
import { invalidPdfFile, validPdfFile } from "@/test-utils/upload-content";

const organizationId = "00000000-0000-4000-8000-000000000001";
const propertyId = "00000000-0000-4000-8000-000000000002";
const unitId = "00000000-0000-4000-8000-000000000003";
const seededPropertyId = "10000000-0000-0000-0000-000000000001";
const seededUnitId = "20000000-0000-0000-0000-000000000001";

describe("unit rent authority", () => {
  beforeEach(() => {
    createDocumentAction.mockReset();
    eq.mockClear();
    from.mockClear();
    maybeSingle.mockReset();
    requirePermission.mockReset();
    revalidatePath.mockReset();
    rpc.mockReset();
    select.mockClear();

    createDocumentAction.mockResolvedValue({ status: "success" });
    requirePermission.mockResolvedValue({ organizationId });
    maybeSingle.mockResolvedValue({ data: { property_id: propertyId }, error: null });
    rpc.mockResolvedValue({ data: unitId, error: null });
  });

  it("maps the editable Active operational state to the neutral stored unit state", async () => {
    const formData = unitForm();
    formData.set("operationalState", "active");
    formData.set("unitId", unitId);

    await expect(updateUnitAction({}, formData)).resolves.toMatchObject({
      status: "success",
      unitId,
    });
    expect(rpc).toHaveBeenCalledWith(
      "update_unit",
      expect.objectContaining({ p_status: "vacant" }),
    );
  });

  it("accepts deterministic UUID-shaped fixture identifiers that PostgreSQL accepts", async () => {
    const formData = unitForm(seededPropertyId);
    formData.set("unitId", seededUnitId);
    maybeSingle.mockResolvedValue({
      data: { property_id: seededPropertyId },
      error: null,
    });

    await expect(updateUnitAction({}, formData)).resolves.toMatchObject({
      status: "success",
      unitId: seededUnitId,
    });
    expect(rpc).toHaveBeenCalledWith(
      "update_unit",
      expect.objectContaining({
        p_property_id: seededPropertyId,
        p_unit_id: seededUnitId,
      }),
    );
  });

  it("rejects occupancy values posted as an operational state", async () => {
    const formData = unitForm();
    formData.set("operationalState", "occupied");
    formData.set("unitId", unitId);

    await expect(updateUnitAction({}, formData)).resolves.toMatchObject({
      fieldErrors: { operationalState: expect.any(Array) },
      status: "error",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not accept a rent override while creating a unit", async () => {
    const formData = unitForm();
    formData.set("currentRentAmount", "9999");

    await expect(createUnitAction({}, formData)).resolves.toMatchObject({
      status: "success",
      unitId,
    });
    expect(rpc).toHaveBeenCalledWith("create_unit", {
      p_bathroom_count: 1,
      p_bedroom_count: 2,
      p_floor: "1",
      p_idempotency_key: "unit-create-request-1",
      p_organization_id: organizationId,
      p_property_id: propertyId,
      p_size_sqm: 48,
      p_status: "vacant",
      p_unit_number: "1A",
    });
    expect(requirePermission).toHaveBeenCalledWith("properties.write");
  });

  it.each(["", "short", "x".repeat(201)])("rejects an invalid creation key before any RPC: %s", async (key) => {
    const formData = unitForm();
    formData.set("idempotencyKey", key);
    await expect(createUnitAction({}, formData)).resolves.toMatchObject({ status: "error" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reuses the exact original key and physical payload after a transport exception", async () => {
    const formData = unitForm();
    rpc.mockRejectedValueOnce(new Error("synthetic response loss"));
    await expect(createUnitAction({}, formData)).rejects.toThrow("synthetic response loss");
    await expect(createUnitAction({}, formData)).resolves.toMatchObject({ status: "success", unitId });
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[1]).toEqual(rpc.mock.calls[0]);
    expect(rpc.mock.calls[0][1].p_idempotency_key).toBe("unit-create-request-1");
  });

  it("rejects create-time document side effects before the keyed unit request", async () => {
    const formData = unitForm();
    formData.set("document", validPdfFile());
    await expect(createUnitAction({}, formData)).resolves.toEqual({
      status: "error", message: "Save the unit first, then attach documents.",
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(createDocumentAction).not.toHaveBeenCalled();
  });

  it("keeps a conflicting keyed request explicit instead of falling back to unkeyed creation", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "Conflicting unit creation request" } });
    await expect(createUnitAction({}, unitForm())).resolves.toEqual({
      status: "error",
      message: "This unit request has already been used. Review the existing unit before starting a new request.",
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][1].p_idempotency_key).toBe("unit-create-request-1");
  });

  it("rejects a spoofed inline document before creating the Unit", async () => {
    const formData = unitForm();
    formData.set("document", invalidPdfFile("unit.pdf"));

    await expect(createUnitAction({}, formData)).resolves.toEqual({
      fieldErrors: {
        document: ["Upload a PDF, JPG, PNG, or WebP file."],
      },
      status: "error",
    });
    expect(rpc).not.toHaveBeenCalled();
    expect(createDocumentAction).not.toHaveBeenCalled();
  });

  it("does not accept a rent override while editing a unit", async () => {
    const formData = unitForm();
    formData.set("currentRentAmount", "9999");
    formData.set("unitId", unitId);

    await expect(updateUnitAction({}, formData)).resolves.toMatchObject({
      status: "success",
      unitId,
    });
    expect(rpc).toHaveBeenCalledWith("update_unit", {
      p_bathroom_count: 1,
      p_bedroom_count: 2,
      p_floor: "1",
      p_organization_id: organizationId,
      p_property_id: propertyId,
      p_size_sqm: 48,
      p_status: "vacant",
      p_unit_id: unitId,
      p_unit_number: "1A",
    });
    expect(requirePermission).toHaveBeenCalledWith("properties.write");
  });

  it("still attaches a document when editing an existing unit without a creation key", async () => {
    const formData = unitForm();
    const document = validPdfFile("unit-record.pdf");
    formData.delete("idempotencyKey");
    formData.set("unitId", unitId);
    formData.set("document", document);
    formData.set("documentCategory", "Unit record");

    await expect(updateUnitAction({}, formData)).resolves.toEqual({
      message: "Unit updated and file uploaded.",
      propertyId,
      status: "success",
      unitId,
    });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("update_unit", expect.objectContaining({
      p_property_id: propertyId,
      p_unit_id: unitId,
    }));
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("p_idempotency_key");
    expect(createDocumentAction).toHaveBeenCalledTimes(1);
    expect(Object.fromEntries(createDocumentAction.mock.calls[0][1] as FormData)).toEqual({
      category: "Unit record",
      document,
      leaseId: "",
      propertyId,
      taskId: "",
      unitId,
    });
  });

  it("preserves zero and blank room counts through the checked create RPC", async () => {
    const formData = unitForm();
    formData.set("bedroomCount", "0");
    formData.set("bathroomCount", "");

    await expect(createUnitAction({}, formData)).resolves.toMatchObject({
      status: "success",
      unitId,
    });
    expect(rpc).toHaveBeenCalledWith(
      "create_unit",
      expect.objectContaining({
        p_bathroom_count: null,
        p_bedroom_count: 0,
      }),
    );
  });

  it("sends saved room counts through the checked update RPC", async () => {
    const formData = unitForm();
    formData.set("bathroomCount", "3");
    formData.set("bedroomCount", "4");
    formData.set("unitId", unitId);

    await expect(updateUnitAction({}, formData)).resolves.toMatchObject({
      status: "success",
      unitId,
    });
    expect(rpc).toHaveBeenCalledWith(
      "update_unit",
      expect.objectContaining({
        p_bathroom_count: 3,
        p_bedroom_count: 4,
      }),
    );
  });

  it.each([
    ["bedroomCount", "-1", "create"],
    ["bathroomCount", "1.5", "create"],
    ["bedroomCount", "101", "edit"],
    ["bathroomCount", "not-a-count", "edit"],
  ] as const)(
    "rejects invalid %s value %s before the %s RPC",
    async (field, value, mode) => {
      const formData = unitForm();
      formData.set(field, value);

      const state =
        mode === "create"
          ? await createUnitAction({}, formData)
          : await updateUnitAction(
              {},
              withValue(formData, "unitId", unitId),
            );

      expect(state).toMatchObject({
        fieldErrors: { [field]: expect.any(Array) },
        status: "error",
      });
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it("directs the operator to close an open lease before archiving its unit", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: { message: "Unit has an open Lease" },
    });
    const formData = new FormData();
    formData.set("unitId", unitId);

    await expect(archiveUnitAction({}, formData)).resolves.toEqual({
      message: "End or cancel the open lease before archiving this unit.",
      status: "error",
    });
    expect(requirePermission).toHaveBeenCalledWith("properties.archive");
  });

  it("uses properties.archive for restore through the checked RPC", async () => {
    const formData = new FormData();
    formData.set("unitId", unitId);

    await expect(restoreUnitAction({}, formData)).resolves.toMatchObject({
      status: "success",
    });

    expect(requirePermission).toHaveBeenCalledWith("properties.archive");
    expect(rpc).toHaveBeenCalledWith("restore_unit", {
      p_organization_id: organizationId,
      p_unit_id: unitId,
    });
  });

  it("fails a guessed or cross-branch unit through the checked update RPC", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    rpc.mockResolvedValue({
      data: null,
      error: { message: "Not authorized" },
    });
    const formData = unitForm();
    formData.set("unitId", unitId);

    await expect(updateUnitAction({}, formData)).resolves.toMatchObject({
      status: "error",
    });

    expect(requirePermission).toHaveBeenCalledWith("properties.write");
    expect(rpc).toHaveBeenCalledWith(
      "update_unit",
      expect.objectContaining({
        p_organization_id: organizationId,
        p_property_id: propertyId,
        p_unit_id: unitId,
      }),
    );
  });
});

function unitForm(selectedPropertyId = propertyId) {
  const formData = new FormData();
  formData.set("idempotencyKey", "unit-create-request-1");
  formData.set("bathroomCount", "1");
  formData.set("bedroomCount", "2");
  formData.set("floor", "1");
  formData.set("propertyId", selectedPropertyId);
  formData.set("sizeSqm", "48");
  formData.set("operationalState", "active");
  formData.set("unitNumber", "1A");
  return formData;
}

function withValue(formData: FormData, key: string, value: string) {
  formData.set(key, value);
  return formData;
}
