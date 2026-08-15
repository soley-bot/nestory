import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createDocumentAction,
  eq,
  from,
  maybeSingle,
  requireSuperAdminContext,
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
    requireSuperAdminContext: vi.fn(),
    revalidatePath: vi.fn(),
    rpc: vi.fn(),
    select,
  };
});

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/features/documents/actions", () => ({ createDocumentAction }));
vi.mock("@/lib/auth/context", () => ({ requireSuperAdminContext }));
vi.mock("@/lib/db/server", () => ({
  createSupabaseServerClient: async () => ({ from, rpc }),
}));

import {
  createUnitAction,
  updateUnitAction,
} from "@/features/units/actions";

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
    requireSuperAdminContext.mockReset();
    revalidatePath.mockReset();
    rpc.mockReset();
    select.mockClear();

    requireSuperAdminContext.mockResolvedValue({ organizationId });
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
      p_floor: "1",
      p_organization_id: organizationId,
      p_property_id: propertyId,
      p_size_sqm: 48,
      p_status: "vacant",
      p_unit_number: "1A",
    });
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
      p_floor: "1",
      p_organization_id: organizationId,
      p_property_id: propertyId,
      p_size_sqm: 48,
      p_status: "vacant",
      p_unit_id: unitId,
      p_unit_number: "1A",
    });
  });
});

function unitForm(selectedPropertyId = propertyId) {
  const formData = new FormData();
  formData.set("floor", "1");
  formData.set("propertyId", selectedPropertyId);
  formData.set("sizeSqm", "48");
  formData.set("operationalState", "active");
  formData.set("unitNumber", "1A");
  return formData;
}
