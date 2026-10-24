/* @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PropertyDetailScreen } from "./property-detail-screen";
import { buildPropertyDetail } from "../data/property-detail";

vi.mock("./property-detail-view", () => ({ PropertyDetailView: ({ onAssignOwner, onCreateLease }: { onAssignOwner?: () => void; onCreateLease?: () => void }) => <div>
  {onAssignOwner && <button onClick={onAssignOwner}>Assign owner</button>}
  {onCreateLease && <button onClick={onCreateLease}>Create lease</button>}
</div> }));
vi.mock("./property-form", () => ({ PropertyForm: () => <form aria-label="Loaded property form" /> }));
vi.mock("@/features/leases/components/lease-form", () => ({ LeaseForm: () => <form aria-label="Loaded lease form" /> }));
vi.mock("./property-drawer-panels", () => ({ ArchivePropertyPanel: () => null, RestorePropertyPanel: () => null }));
vi.mock("@/features/documents/components/document-screen", () => ({ DocumentForm: () => null }));
vi.mock("@/features/units/components/unit-form", () => ({ UnitForm: () => null }));

const property = buildPropertyDetail({
  ledgerEntries: [], units: [],
  property: { id: "property", name: "Home", code: "HOME", status: "active", property_type: "House", owner: null, address: null, rental_structure: "single_space" },
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("property form choices load on intent", () => {
  it.each([["Edit", "edit"], ["Assign owner", "edit"], ["Create lease", "lease"]])("fetches only after opening %s", async (action, mode) => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ mode, propertyId: property.id, options: mode === "edit" ? { owners: [] } : { tenants: [], billingFormConfig: {} } }));
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<PropertyDetailScreen property={property} />);
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: action }));
    await screen.findByRole("form", { name: mode === "edit" ? "Loaded property form" : "Loaded lease form" });
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(`/api/properties/property/form-options?mode=${mode}`, expect.objectContaining({ cache: "no-store", signal: expect.any(AbortSignal) }));
    const signal = fetchMock.mock.calls[0][1].signal;
    view.unmount();
    expect(signal.aborted).toBe(true);
  });
  it("keeps view-only pages free of requests and form actions", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<PropertyDetailScreen property={property} canWrite={false} canCreateLease={false} />);
    expect(fetchMock).not.toHaveBeenCalled();
    for (const action of ["Edit", "Assign owner", "Create lease"]) expect(screen.queryByRole("button", { name: action })).toBeNull();
  });
});
