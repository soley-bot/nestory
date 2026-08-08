import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  getMaintenanceVendorSelectOptions,
  MaintenanceForm,
} from "@/features/maintenance/components/maintenance-screen";
import type { MaintenanceCase } from "@/features/maintenance/maintenance.types";

vi.mock("next/navigation", () => ({
  usePathname: () => "/maintenance",
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

describe("maintenance vendor form", () => {
  it("uses Vendor and No vendor copy with active vendor options", () => {
    const vendors = [{
      id: "vendor-1",
      label: "A very long active vendor name that remains deliberate in the shared select control",
    }];
    const vendorSelect = getMaintenanceVendorSelectOptions({ vendors });
    const html = renderToStaticMarkup(
      <MaintenanceForm
        actor={{ role: "super_admin" }}
        branches={[]}
        canRecordActualCost
        mode="create"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        properties={[{ id: "property-1", label: "Property One" }]}
        staff={[]}
        units={[]}
        vendors={vendors}
      />,
    );

    expect(vendorSelect.options).toEqual([
      { label: "No vendor", value: "" },
      { label: vendors[0].label, value: "vendor-1" },
    ]);
    expect(html).toContain("Vendor");
    expect(html).not.toContain("Vendor/person");
    expect(html).not.toContain("No vendor/person");
  });

  it("keeps an ineligible historical vendor visible with reassignment and clearing guidance", () => {
    const maintenanceCase = {
      assigneeLabel: "Unassigned",
      branchLabel: "No branch",
      executionMode: "manager_coordinated",
      formValues: {
        category: "Plumbing",
        checklistText: "",
        priority: "normal",
        propertyId: "property-1",
        recurrenceFrequency: "none",
        status: "pending",
        title: "Repair sink",
        vendorPersonId: "legacy-vendor",
      },
      id: "task-1",
      vendorLabel: "Legacy Plumbing",
    } as MaintenanceCase;

    const vendorSelect = getMaintenanceVendorSelectOptions({
      currentVendorId: maintenanceCase.formValues.vendorPersonId,
      currentVendorLabel: maintenanceCase.vendorLabel,
      vendors: [{ id: "active-vendor", label: "Active Vendor" }],
    });
    const html = renderToStaticMarkup(
      <MaintenanceForm
        actor={{ role: "super_admin" }}
        branches={[]}
        canRecordActualCost
        maintenanceCase={maintenanceCase}
        mode="edit"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        properties={[{ id: "property-1", label: "Property One" }]}
        staff={[]}
        units={[]}
        vendors={[{ id: "active-vendor", label: "Active Vendor" }]}
      />,
    );

    expect(vendorSelect).toMatchObject({
      hasHistoricalVendor: true,
      options: [
        { label: "No vendor", value: "" },
        {
          label: "Legacy Plumbing (historical/inactive)",
          value: "legacy-vendor",
        },
        { label: "Active Vendor", value: "active-vendor" },
      ],
    });
    expect(html).toContain("This historical vendor remains linked");
    expect(html).toContain('or choose an active vendor or &quot;No vendor&quot;');
  });

  it("keeps vendor assignment available to managers without exposing ledger posting", () => {
    const html = renderToStaticMarkup(
      <MaintenanceForm
        actor={{ branchId: "branch-1", role: "operations_manager" }}
        branches={[{ id: "branch-1", label: "Main branch" }]}
        canRecordActualCost
        maintenanceCase={{
          assigneeLabel: "Unassigned",
          branchId: "branch-1",
          branchLabel: "Main branch",
          executionMode: "manager_coordinated",
          formValues: {
            branchId: "branch-1",
            category: "Plumbing",
            checklistText: "",
            priority: "normal",
            propertyId: "property-1",
            recurrenceFrequency: "none",
            status: "pending",
            title: "Repair sink",
            vendorPersonId: "vendor-1",
          },
          id: "task-1",
          vendorLabel: "Rapid Repairs",
        } as MaintenanceCase}
        mode="edit"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        properties={[{ id: "property-1", label: "Property One" }]}
        staff={[]}
        units={[]}
        vendors={[{ id: "vendor-1", label: "Rapid Repairs" }]}
      />,
    );

    expect(
      getMaintenanceVendorSelectOptions({
        currentVendorId: "vendor-1",
        currentVendorLabel: "Rapid Repairs",
        vendors: [{ id: "vendor-1", label: "Rapid Repairs" }],
      }).options,
    ).toContainEqual({ label: "Rapid Repairs", value: "vendor-1" });
    expect(html).toContain('name="vendorPersonId" value="vendor-1"');
    expect(html).toContain("Actual cost");
    expect(html).not.toContain("Link actual cost to ledger");
  });

  it("locks approved property, unit, and vendor scope while keeping adjustment cost editable", () => {
    const html = renderToStaticMarkup(
      <MaintenanceForm
        actor={{ branchId: "branch-1", role: "operations_manager" }}
        branches={[{ id: "branch-1", label: "Main branch" }]}
        canRecordActualCost
        maintenanceCase={{
          assigneeLabel: "Unassigned",
          branchId: "branch-1",
          branchLabel: "Main branch",
          costSubmission: {
            id: "submission-1",
            reviewReason: null,
            status: "approved",
            submittedAt: "2026-08-08T08:00:00Z",
          },
          executionMode: "manager_coordinated",
          formValues: {
            actualCostAmount: 100,
            branchId: "branch-1",
            category: "Plumbing",
            checklistText: "",
            priority: "normal",
            propertyId: "property-1",
            recurrenceFrequency: "none",
            status: "completed",
            title: "Repair sink",
            unitId: "unit-1",
            vendorPersonId: "vendor-1",
          },
          id: "task-1",
          vendorLabel: "Rapid Repairs",
        } as MaintenanceCase}
        mode="edit"
        onClose={vi.fn()}
        onSuccess={vi.fn()}
        properties={[{ id: "property-1", label: "Property One" }]}
        staff={[]}
        units={[
          { id: "unit-1", label: "Unit One", propertyId: "property-1" },
        ]}
        vendors={[{ id: "vendor-1", label: "Rapid Repairs" }]}
      />,
    );

    expect(html.match(/name="propertyId"/g)).toHaveLength(1);
    expect(html.match(/name="unitId"/g)).toHaveLength(1);
    expect(html.match(/name="vendorPersonId"/g)).toHaveLength(1);
    expect(html).toContain(
      'type="hidden" name="propertyId" value="property-1"',
    );
    expect(html).toContain('type="hidden" name="unitId" value="unit-1"');
    expect(html).toContain(
      'type="hidden" name="vendorPersonId" value="vendor-1"',
    );
    expect(html).toContain("locked to the approved financial history");
    expect(html).toContain('name="actualCostAmount"');
    expect(html).not.toMatch(/name="actualCostAmount"[^>]*readonly/);
  });
});
