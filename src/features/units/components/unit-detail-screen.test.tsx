/* @vitest-environment jsdom */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { UnitDetailScreen } from "@/features/units/components/unit-detail-screen";
import { buildUnitDetail } from "@/features/units/data/unit-summary";

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
});

describe("UnitDetailScreen focused operating record", () => {
  it("uses the property-style header and five focused sections", () => {
    const { container } = renderUnitDetail();

    expect(screen.getByRole("heading", { level: 1, name: "Unit 12A" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "More" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Review open issue" })).toBeTruthy();
    expect(screen.getByText("Operational readiness: Available")).toBeTruthy();
    expect(screen.getByText("Lease state: Occupied")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Archive" })).toBeNull();

    const tablist = screen.getByRole("tablist");
    expect(within(tablist).getAllByRole("tab").map((tab) => tab.textContent)).toEqual([
      "Overview",
      "Lease",
      "Finance",
      "Maintenance",
      "Files",
    ]);
    expect(tablist.closest("nav")?.className.split(" ")).not.toContain("rounded-md");
    expect(container.querySelectorAll('[role="tabpanel"]')).toHaveLength(1);
  });

  it("keeps the overview quiet and shows only unresolved record attention", () => {
    renderUnitDetail();

    const panel = screen.getByRole("tabpanel", { name: "Overview" });
    const summary = within(panel).getByRole("group", { name: "Unit summary" });
    expect(within(summary).getAllByRole("term")).toHaveLength(3);
    expect(within(summary).getByText("Tenant")).toBeTruthy();
    expect(within(summary).getByText("Monthly rent")).toBeTruthy();
    expect(within(summary).getByText("Ledger net")).toBeTruthy();
    expect(within(panel).getByRole("region", { name: "Unit attention" })).toBeTruthy();
    expect(within(panel).queryByText("Status needs review")).toBeNull();
    expect(within(panel).queryByText(/unit status is not occupied/i)).toBeNull();
    expect(within(panel).getByText("Evidence missing")).toBeTruthy();
    expect(within(panel).queryByRole("heading", { name: "Unit context" })).toBeNull();
    expect(within(panel).queryByRole("heading", { name: "Record quality" })).toBeNull();
    expect(within(panel).queryByText(/recent profile changes/i)).toBeNull();
    expect(within(panel).queryByText(/ledger \/ .* timeline/i)).toBeNull();
  });

  it("consolidates photos and documents into Files and uploads against this unit locally", () => {
    renderUnitDetail({ initialSection: "files" });

    const panel = screen.getByRole("tabpanel", { name: "Files" });
    expect(within(panel).getByRole("heading", { name: "Photos" })).toBeTruthy();
    expect(within(panel).getByRole("heading", { name: "Unit documents" })).toBeTruthy();
    const addDocument = within(panel).getByRole("button", {
      name: "Add unit document",
    });
    expect(within(panel).queryByRole("link", { name: "Add unit document" })).toBeNull();

    fireEvent.click(addDocument);

    const drawer = screen.getByRole("dialog", { name: "Upload document" });
    const form = within(drawer).getByRole("form", { name: "Upload document form" });
    expect(form.querySelector<HTMLInputElement>('input[name="propertyId"]')?.value).toBe(
      "property-1",
    );
    expect(form.querySelector<HTMLInputElement>('input[name="unitId"]')?.value).toBe(
      "unit-1",
    );
    expect(within(drawer).queryByRole("heading", { name: "Record link" })).toBeNull();
    expect(within(drawer).queryByRole("combobox", { name: /^Property/ })).toBeNull();
  });

  it("keeps history and archive secondary while placing the unit report in Finance", async () => {
    renderUnitDetail({ initialSection: "finance" });

    const finance = screen.getByRole("tabpanel", { name: "Finance" });
    expect(within(finance).getByRole("link", { name: /Unit income statement/ })).toBeTruthy();
    expect(screen.queryByRole("tab", { name: "Reports" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Timeline" })).toBeNull();

    fireEvent.pointerDown(screen.getByRole("button", { name: "More" }));
    expect(await screen.findByRole("menuitem", { name: "View history" })).toBeTruthy();
    fireEvent.click(screen.getByRole("menuitem", { name: "Archive" }));

    const dialog = screen.getByRole("dialog", { name: "Archive Unit 12A?" });
    expect(dialog.className).toContain("sm:max-w-md");
    expect(within(dialog).queryByText("Archive confirmation")).toBeNull();
    expect(within(dialog).queryByText(/timeline, ledger, lease/i)).toBeNull();
  });

  it("creates a maintenance case without leaving the unit record", () => {
    renderUnitDetail({ initialSection: "maintenance" });

    const panel = screen.getByRole("tabpanel", { name: "Maintenance" });
    expect(within(panel).queryByRole("link", { name: "New case" })).toBeNull();

    fireEvent.click(within(panel).getByRole("button", { name: "New case" }));

    const drawer = screen.getByRole("dialog", { name: "New maintenance case" });
    expect(drawer.querySelector("form")).toBeTruthy();
    expect(within(drawer).getAllByText("CTR / Central Residence")).toHaveLength(2);
    expect(within(drawer).getAllByText("Unit 12A")).toHaveLength(2);
  });

  it("reviews a maintenance case locally with an explicit full-record escape", () => {
    renderUnitDetail({ initialSection: "maintenance" });

    const panel = screen.getByRole("tabpanel", { name: "Maintenance" });
    fireEvent.click(
      within(panel).getByRole("button", {
        name: "Review Kitchen sink repair maintenance case",
      }),
    );

    const drawer = screen.getByRole("dialog", { name: "Maintenance case" });
    expect(within(drawer).getByText("Kitchen sink repair")).toBeTruthy();
    expect(within(drawer).getByRole("link", { name: "Open in Maintenance" })).toBeTruthy();
  });

  it("reviews ledger entries locally and removes the unsupported manual entry action", () => {
    renderUnitDetail({ initialSection: "finance" });

    const panel = screen.getByRole("tabpanel", { name: "Finance" });
    expect(within(panel).queryByRole("link", { name: "Add entry" })).toBeNull();
    expect(within(panel).queryByRole("button", { name: "Add entry" })).toBeNull();

    fireEvent.click(
      within(panel).getByRole("button", { name: "Review Rent ledger entry" }),
    );

    const drawer = screen.getByRole("dialog", { name: "Ledger entry" });
    expect(within(drawer).getByText("August rent")).toBeTruthy();
    expect(within(drawer).getByRole("link", { name: "Open in Ledger" })).toBeTruthy();
  });

  it("reviews the current lease locally with an explicit full-record escape", () => {
    renderUnitDetail({ initialSection: "lease" });

    const panel = screen.getByRole("tabpanel", { name: "Lease" });
    expect(within(panel).queryByRole("link", { name: "Open lease" })).toBeNull();
    fireEvent.click(within(panel).getByRole("button", { name: "Open lease" }));

    const drawer = screen.getByRole("dialog", { name: "Lease details" });
    expect(within(drawer).getAllByText("Dara Tenant")).toHaveLength(2);
    expect(within(drawer).getByRole("link", { name: "Open full lease" })).toBeTruthy();
  });

  it("relies on the canonical action for an available unit without a Lease", () => {
    renderUnitDetail({ initialSection: "lease", unit: availableUnitDetail });

    const panel = screen.getByRole("tabpanel", { name: "Lease" });
    expect(within(panel).queryByRole("link", { name: "Add lease" })).toBeNull();
    expect(within(panel).queryByRole("button", { name: "Add lease" })).toBeNull();
    expect(within(panel).getByText(/no current or draft lease/i)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Create draft lease" }).getAttribute("href"),
    ).toBe(
      "/leases?action=create&propertyId=property-1&source=vacancy&unitId=unit-1",
    );
    expect(screen.queryByRole("dialog", { name: "Add lease" })).toBeNull();
  });

  it("blocks the local Lease handoff while the unit is in maintenance", () => {
    renderUnitDetail({ initialSection: "lease", unit: maintenanceUnitDetail });

    const panel = screen.getByRole("tabpanel", { name: "Lease" });
    expect(within(panel).queryByRole("button", { name: "Add lease" })).toBeNull();
    expect(within(panel).getByText(/maintenance.*before leasing/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Log maintenance case" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Add lease" })).toBeNull();
  });

  it("shows draft Lease facts and relies on the exact Continue draft action", () => {
    renderUnitDetail({ initialSection: "lease", unit: draftUnitDetail });

    const panel = screen.getByRole("tabpanel", { name: "Lease" });
    expect(within(panel).queryByRole("button", { name: "Add lease" })).toBeNull();
    expect(within(panel).getByText("Sam Draft")).toBeTruthy();
    expect(within(panel).getByText("Draft")).toBeTruthy();
    expect(within(panel).getByText("Lease dates")).toBeTruthy();
    expect(within(panel).getByText("Monthly rent")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Continue draft" }).getAttribute("href"),
    ).toBe("/leases/draft-lease-1");
    expect(screen.queryByRole("dialog", { name: "Add lease" })).toBeNull();
  });

  it("edits only unit-owned fields while an active lease controls occupancy", async () => {
    renderUnitDetail({ initialSection: "lease" });

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    const dialog = screen.getByRole("dialog", { name: "Edit unit" });
    expect(dialog.className).toContain("sm:max-w-2xl");
    expect(within(dialog).queryByText("Update the unit profile.")).toBeNull();
    expect(within(dialog).getByText("Occupancy")).toBeTruthy();
    expect(within(dialog).getByText("Occupied")).toBeTruthy();
    const operationalState = within(dialog).getByRole("group", {
      name: /^Operational state/,
    });
    expect(operationalState.textContent).toContain("Active");
    expect(
      within(operationalState).getByText("Active").getAttribute("aria-labelledby"),
    ).toBeTruthy();
    expect(
      within(operationalState).queryByRole("combobox"),
    ).toBeNull();
    expect(within(dialog).queryByRole("combobox", { name: "Status" })).toBeNull();
    expect(within(dialog).queryByText("Occupied", { selector: "[role=option]" })).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Close modal" })).toBeTruthy();

    const save = within(dialog).getByRole<HTMLButtonElement>("button", {
      name: "Save changes",
    });
    expect(save.disabled).toBe(true);

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    fireEvent.input(within(dialog).getByRole("textbox", { name: /^Unit number/ }), {
      target: { value: "12B" },
    });

    await waitFor(() => expect(save.disabled).toBe(false));
  });

  it("gives long property names their own row above the compact state fields", () => {
    renderUnitDetail();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    const placement = screen.getByRole("group", { name: "Placement" });
    const property = within(placement).getByRole("group", { name: /^Property/ });

    expect(property.className).toContain("sm:col-span-2");
    expect(property.parentElement?.className).toContain("sm:grid-cols-2");
  });
});

function renderUnitDetail({
  initialSection = "overview",
  unit = unitDetail,
}: {
  initialSection?: "overview" | "lease" | "finance" | "maintenance" | "files";
  unit?: typeof unitDetail;
} = {}) {
  return render(
    <UnitDetailScreen
      activeSection={initialSection}
      maintenanceFormOptions={{
        actor: { role: "super_admin" },
        branches: [],
        canRecordActualCost: true,
        properties: [{ id: "property-1", label: "CTR / Central Residence" }],
        staff: [],
        units: [{ id: "unit-1", label: "Unit 12A", propertyId: "property-1" }],
        vendors: [],
      }}
      propertyOptions={[{ id: "property-1", label: "CTR / Central Residence" }]}
      unit={unit}
    />,
  );
}

const unitDetail = buildUnitDetail({
  activeLease: {
    id: "lease-1",
    lease_end_date: "2027-01-31",
    lease_start_date: "2026-02-01",
    monthly_rent_amount: 850,
    monthly_rent_currency: "USD",
    primary_tenant_person_id: "person-1",
    status: "active",
    tenant_name: "Dara Tenant",
    unit_id: "unit-1",
  },
  counts: {
    documents: 0,
    ledgerEntries: 1,
    maintenanceCases: 0,
    openMaintenanceCases: 0,
    overdueMaintenanceCases: 0,
    photos: 0,
    timelineEvents: 0,
  },
  documents: [],
  ledgerEntries: [
    {
      amount: 850,
      category: "Rent",
      currency: "USD",
      direction: "income",
      id: "entry-1",
      transaction_date: "2026-08-01",
      unit_id: "unit-1",
    },
  ],
  maintenanceCases: [
    {
      actual_cost_amount: 125,
      actual_cost_currency: "USD",
      category: "Plumbing",
      due_date: "2026-08-15",
      due_time: "10:00:00",
      id: "maintenance-1",
      priority: "normal",
      status: "pending",
      title: "Kitchen sink repair",
    },
  ],
  people: [
    {
      display_name: "Dara Tenant",
      id: "person-1",
      primary_email: "dara@example.com",
      primary_phone: null,
    },
  ],
  property: { code: "CTR", id: "property-1", name: "Central Residence" },
  recentLedgerEntries: [
    {
      amount: 850,
      category: "Rent",
      currency: "USD",
      description: "August rent",
      direction: "income",
      id: "entry-1",
      transaction_date: "2026-08-01",
      unit_id: "unit-1",
    },
  ],
  recentTimelineEvents: [],
  unit: {
    archived_at: null,
    current_rent_amount: 850,
    current_rent_currency: "USD",
    floor: "12",
    id: "unit-1",
    property_id: "property-1",
    size_sqm: 55,
    status: "vacant",
    unit_number: "12A",
  },
});

const draftLease = {
  id: "draft-lease-1",
  lease_end_date: "2027-07-31",
  lease_start_date: "2026-08-01",
  monthly_rent_amount: 900,
  monthly_rent_currency: "USD" as const,
  primary_tenant_person_id: "person-2",
  status: "draft",
  tenant_name: "Sam Draft",
  unit_id: "unit-1",
};

const availableUnitDetail = buildLeasePanelUnitDetail("vacant");
const maintenanceUnitDetail = buildLeasePanelUnitDetail("maintenance");
const draftUnitDetail = buildLeasePanelUnitDetail("vacant", draftLease);

function buildLeasePanelUnitDetail(
  status: "maintenance" | "vacant",
  selectedDraftLease?: typeof draftLease,
) {
  return buildUnitDetail({
    counts: {
      documents: 0,
      ledgerEntries: 0,
      maintenanceCases: 0,
      openMaintenanceCases: 0,
      overdueMaintenanceCases: 0,
      photos: 0,
      timelineEvents: 0,
    },
    documents: [],
    draftLease: selectedDraftLease,
    ledgerEntries: [],
    maintenanceCases: [],
    people: [],
    property: { code: "CTR", id: "property-1", name: "Central Residence" },
    recentLedgerEntries: [],
    recentTimelineEvents: [],
    unit: {
      archived_at: null,
      current_rent_amount: 900,
      current_rent_currency: "USD",
      floor: "12",
      id: "unit-1",
      property_id: "property-1",
      size_sqm: 55,
      status,
      unit_number: "12A",
    },
  });
}

class ResizeObserverStub {
  disconnect() {}
  observe() {}
  unobserve() {}
}
