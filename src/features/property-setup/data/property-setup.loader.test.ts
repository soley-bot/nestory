import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCappedReadHarness } from "@/lib/db/complete-read.test-fixture";

const mocks = vi.hoisted(() => ({ client: vi.fn(), page: vi.fn() }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: mocks.client }));
vi.mock("@/features/people/data/person-options", () => ({ getPersonSelectPage: mocks.page }));
import { getPropertySetupData } from "./property-setup";

describe("setup selected identities", () => {
  beforeEach(() => {
    mocks.client.mockReset().mockResolvedValue(createCappedReadHarness({ properties: [], property_owners: [], units: [], current_leases: [] }).client);
    mocks.page.mockReset();
  });

  it.each([false,true])("validates selected people outside the first 25 options (archived=%s)", async archived => {
    const requestedSelection = { ownerId: "owner-5000", tenantId: "tenant-5000", propertyId: null, unitId: null, leaseId: null };
    mocks.page.mockImplementation(async ({ roles,selectedId }) => ({
      options: Array.from({ length: 25 }, (_,index) => ({ id: `${roles[0]}-${index}`,label: `Person ${index}`,description: "",roles,archived: false })),
      selectedOption: { id: selectedId,label: "Last person",description: "",roles,archived },hasMore: true,
    }));
    const data = await getPropertySetupData({ organizationId: "org",requestedSelection });
    expect(data.selection).toEqual({ ...requestedSelection,ownerId: archived ? null : requestedSelection.ownerId,tenantId: archived ? null : requestedSelection.tenantId });
    expect(data.owners).toHaveLength(archived ? 25 : 26);
    expect(data.tenants).toHaveLength(archived ? 25 : 26);
    expect(mocks.page).toHaveBeenCalledWith({ organizationId: "org",roles: ["owner"],selectedId: "owner-5000" });
    expect(mocks.page).toHaveBeenCalledWith({ organizationId: "org",roles: ["tenant"],selectedId: "tenant-5000" });
  });

  it.each([1205,5000])("preserves late selections across %i properties and selected-property units", async size => {
    const selectedProperty=`property-${String(size-1).padStart(5,"0")}`;
    const properties=Array.from({ length: size },(_,index) => ({ id: `property-${String(index).padStart(5,"0")}`,organization_id: "org",code: `P${index}`,name: `Property ${index}`,rental_structure: "multi_unit",status: "active",archived_at: null }));
    const owners=properties.map((property,index) => ({ id: `link-${index}`,organization_id: "org",property_id: property.id,person_id: "owner-5000",is_primary: true,archived_at: null,ended_on: null }));
    const units=Array.from({ length: size },(_,index) => ({ id: `unit-${String(index).padStart(5,"0")}`,organization_id: "org",property_id: selectedProperty,unit_number: `Unit ${index}`,status: "vacant",archived_at: null }));
    const leases=units.map((unit,index) => ({ id: `lease-${String(index).padStart(5,"0")}`,organization_id: "org",property_id: selectedProperty,unit_id: unit.id,primary_tenant_person_id: `tenant-${index}`,tenant_name: `Tenant ${index}`,lease_start_date: "2026-01-01",lease_end_date: "2026-12-31",monthly_rent_amount: 500,status: "active",archived_at: null }));
    const harness=createCappedReadHarness({ properties,property_owners: owners,units: [...units,{ ...units[0],id: "unrelated-unit",property_id: properties[0].id }],current_leases: leases });
    mocks.client.mockResolvedValue({ ...harness.client,rpc: vi.fn().mockResolvedValue({ data: null,error: null }) });
    mocks.page.mockImplementation(async ({ roles,selectedId }) => ({ options: [],selectedOption: { id: selectedId,label: selectedId,description: "",roles,archived: false },hasMore: true }));
    const requestedSelection={ ownerId: "owner-5000",propertyId: selectedProperty,unitId: units.at(-1)!.id,tenantId: leases.at(-1)!.primary_tenant_person_id,leaseId: leases.at(-1)!.id };
    const data=await getPropertySetupData({ organizationId: "org",requestedSelection });
    expect(data.selection).toEqual(requestedSelection);
    expect(data.properties).toHaveLength(size);
    expect(data.units).toHaveLength(size);
    expect(data.leases).toHaveLength(size);
    expect(harness.reads.every(read => read.range && read.range[1]-read.range[0]<500)).toBe(true);
    expect(harness.reads.filter(read => read.table === "units").every(read => read.filters.some(filter => filter.column === "property_id" && filter.value === selectedProperty))).toBe(true);
  });

  it("does not load a portfolio before an owner is selected", async () => {
    const harness=createCappedReadHarness({});
    mocks.client.mockResolvedValue(harness.client);
    mocks.page.mockResolvedValue({ options: [],selectedOption: null,hasMore: false });
    const data=await getPropertySetupData({ organizationId: "org",requestedSelection: { ownerId: null,propertyId: null,unitId: null,tenantId: null,leaseId: null } });
    expect(data.properties).toEqual([]);
    expect(data.units).toEqual([]);
    expect(data.leases).toEqual([]);
    expect(harness.reads).toEqual([]);
  });

  it("preserves legacy rental structure from complete scoped unit counts", async () => {
    const properties=[{ id: "legacy",organization_id: "org",code: "OLD",name: "Legacy",rental_structure: null,status: "active",archived_at: null },{ id: "other",organization_id: "org",code: "OTHER",name: "Other owner",rental_structure: "multi_unit",status: "active",archived_at: null }];
    const property_owners=properties.map(property => ({ id: `link-${property.id}`,organization_id: "org",property_id: property.id,person_id: property.id === "legacy" ? "owner" : "other-owner",is_primary: true,archived_at: null,ended_on: null }));
    const units=Array.from({ length: 1205 },(_,index) => ({ id: `unit-${index}`,organization_id: "org",property_id: "legacy",unit_number: String(index),status: "vacant",archived_at: null }));
    const harness=createCappedReadHarness({ properties,property_owners,units });
    mocks.client.mockResolvedValue(harness.client);
    mocks.page.mockImplementation(async ({ roles,selectedId }) => ({ options: [],selectedOption: selectedId ? { id: selectedId,label: selectedId,description: "",roles,archived: false } : null,hasMore: false }));
    const data=await getPropertySetupData({ organizationId: "org",requestedSelection: { ownerId: "owner",propertyId: null,unitId: null,tenantId: null,leaseId: null } });
    expect(data.properties).toEqual([{ id: "legacy",label: "Legacy — OLD",ownerPersonId: "owner",rentalStructure: "multi_unit" }]);
    expect(data.units).toEqual([]);
    expect(data.leases).toEqual([]);
    expect(harness.reads.filter(read => read.table === "units").reduce((count,read) => count+(read.returnedRows ?? 0),0)).toBe(1205);
  });
});
