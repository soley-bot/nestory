/* @vitest-environment jsdom */

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PropertyDetailScreen } from "@/features/properties/components/property-detail-screen";
import {
  buildPropertyDetail,
  type PropertyDetail,
} from "@/features/properties/data/property-detail";

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});

describe("PropertyDetailScreen task-first detail contract", () => {
  it("keeps the property heading and edit action beside five focused record tabs", () => {
    const { container } = renderPropertyDetail();

    const propertyHeading = screen.getByRole("heading", {
      level: 1,
      name: "Nestory Residence",
    });
    expect(propertyHeading.closest("header")?.className).toContain("px-4");
    expect(propertyHeading.closest("header")?.className).toContain("sm:px-6");
    expect(screen.getByText("NST-001 / Serviced Apartment")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "More" })).toBeTruthy();

    const tablist = screen.getByRole("tablist");
    expect(within(tablist).getAllByRole("tab")).toHaveLength(5);
    expect(
      within(tablist).getAllByRole("tab").map((tab) => tab.textContent),
    ).toEqual([
      "Overview",
      "Units",
      "Account",
      "Maintenance",
      "Files",
    ]);

    expect(
      within(tablist).getByRole("tab", { name: "Account" }).getAttribute("href"),
    ).toBe("/properties/property-1/account");

    const tabNavigation = tablist.closest("nav");
    expect(tabNavigation?.className.split(" ")).not.toContain("rounded-md");
    expect(tabNavigation?.className.split(" ")).not.toContain("border");
    expect(screen.queryByRole("link", { name: "View history" })).toBeNull();
    expect(container.querySelectorAll('[role="tabpanel"]')).toHaveLength(1);
  });

  it("shows one primary next action, actionable alerts, and period-specific NOI", () => {
    const { container } = renderPropertyDetail({
      propertyOverride: propertyWithWorkflowAttention,
    });

    const workspace = container.querySelector<HTMLElement>(
      '[data-slot="property-record-workspace"]',
    );
    expect(workspace?.className).toContain("px-4");
    expect(workspace?.className).toContain("sm:px-6");

    const overviewPanel = screen.getByRole("tabpanel", { name: "Overview" });
    const propertySummary = overviewPanel.querySelector<HTMLElement>(
      'dl[aria-label="Property summary"]',
    );
    expect(propertySummary).not.toBeNull();
    expect(within(propertySummary!).getAllByRole("term")).toHaveLength(3);
    expect(within(propertySummary!).getByText("Occupancy")).toBeTruthy();
    expect(within(propertySummary!).getByText("Active leases")).toBeTruthy();
    expect(
      within(propertySummary!).getByText("NOI / Trailing 12 months"),
    ).toBeTruthy();
    expect(within(propertySummary!).getByText("USD 1,100.00")).toBeTruthy();
    expect(within(overviewPanel).getByText("District 1")).toBeTruthy();
    expect(within(overviewPanel).getByText("Jane Owner")).toBeTruthy();

    const nextActions = within(overviewPanel).getAllByRole("link", {
      name: "Review overdue issue",
    });
    expect(nextActions).toHaveLength(1);
    expect(nextActions[0]?.getAttribute("href")).toBe(
      "/maintenance?archiveState=all&taskId=case-overdue",
    );
    expect(
      within(nextActions[0]!).getByText(
        "Annual inspection is overdue under this property.",
      ),
    ).toBeTruthy();

    const alerts = within(overviewPanel).getByRole("list", {
      name: "Property alerts",
    });
    expect(within(alerts).getAllByRole("listitem")).toHaveLength(2);
    expect(within(alerts).getByText("Evidence missing")).toBeTruthy();
    expect(within(alerts).getByText("Maintenance overdue")).toBeTruthy();
    expect(within(alerts).queryByText("Owner linked")).toBeNull();
    expect(within(alerts).queryByText("NOI positive")).toBeNull();
    expect(
      within(overviewPanel).queryByRole("heading", { name: "Property context" }),
    ).toBeNull();
    expect(within(overviewPanel).queryByText("1 current lease links")).toBeNull();
  });

  it("keeps Add lease as the only workflow handoff when it is the canonical next action", () => {
    renderPropertyDetail({ propertyOverride: propertyWithoutActiveLease });

    const overviewPanel = screen.getByRole("tabpanel", { name: "Overview" });
    const addLeaseLinks = within(overviewPanel).getAllByRole("link", {
      name: "Add lease",
    });

    expect(addLeaseLinks).toHaveLength(1);
    expect(addLeaseLinks[0]?.getAttribute("href")).toBe(
      "/leases?action=create&propertyId=property-1",
    );
    expect(
      within(overviewPanel).getByText(
        "No active leases are linked to this property.",
      ),
    ).toBeTruthy();
    expect(within(overviewPanel).getByRole("link", { name: "Owner" })).toBeTruthy();
  });

  it("renders the terminal accent next action with the accent treatment", () => {
    renderPropertyDetail({ propertyOverride: propertyWithAccentNextAction });

    const nextAction = screen.getByRole("link", { name: "Log maintenance case" });
    expect(nextAction.className).toContain("border-primary");
    expect(nextAction.className).toContain("bg-primary/10");
  });

  it("opens property-scoped unit creation locally and keeps unit records operational", () => {
    renderPropertyDetail();

    const overviewPanel = screen.getByRole("tabpanel", { name: "Overview" });
    expect(overviewPanel).toBeTruthy();
    expect(screen.queryByRole("tabpanel", { name: "Units" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Unit 04-01" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-controls")).toBe(
      overviewPanel.id,
    );
    expect(screen.getByRole("tab", { name: "Units" }).getAttribute("aria-controls")).toBeNull();

    fireEvent.click(screen.getByRole("tab", { name: "Units" }));

    expect(`${window.location.pathname}${window.location.search}`).toBe(
      "/properties/property-1?section=units",
    );

    const unitsPanel = screen.getByRole("tabpanel", { name: "Units" });
    expect(screen.queryByRole("tabpanel", { name: "Overview" })).toBeNull();
    expect(screen.getByRole("tab", { name: "Units" }).getAttribute("aria-controls")).toBe(
      unitsPanel.id,
    );
    expect(screen.getByRole("tab", { name: "Overview" }).getAttribute("aria-controls")).toBeNull();
    expect(
      within(unitsPanel)
        .getAllByRole("link", { name: "Unit 04-01" })
        .every((link) => link.getAttribute("href") === "/units/unit-1"),
    ).toBe(true);
    expect(within(unitsPanel).getByText("1 unit · 1 occupied · 0 vacant")).toBeTruthy();
    expect(within(unitsPanel).getAllByText("Dara Tenant")).toHaveLength(2);
    expect(within(unitsPanel).getByRole("columnheader", { name: "Occupancy / tenant" })).toBeTruthy();
    expect(within(unitsPanel).getByRole("columnheader", { name: "Lease ends" })).toBeTruthy();
    expect(within(unitsPanel).getByRole("columnheader", { name: "Monthly rent" })).toBeTruthy();
    expect(within(unitsPanel).getByRole("columnheader", { name: "Attention" })).toBeTruthy();

    const addUnit = within(unitsPanel).getByRole("button", { name: "Add unit" });
    expect(within(unitsPanel).queryByRole("link", { name: "Add unit" })).toBeNull();
    fireEvent.click(addUnit);

    const form = screen.getByRole("form", { name: "Add unit form" });
    expect(
      within(form).getByRole("combobox", { name: /^Property/ }).textContent,
    ).toBe("Nestory Residence");
  });

  it("keeps deep-linked tab state aligned when the route section changes", () => {
    const { rerender } = renderPropertyDetail({ initialSection: "units" });

    expect(screen.getByRole("tabpanel", { name: "Units" })).toBeTruthy();

    rerender(
      <PropertyDetailScreen
        initialSection="maintenance"
        ownerOptions={[]}
        property={property}
      />,
    );

    expect(screen.getByRole("tabpanel", { name: /Maintenance/ })).toBeTruthy();
    expect(screen.getByRole("tab", { name: /Maintenance/ }).getAttribute("aria-selected")).toBe(
      "true",
    );
  });

  it("makes property maintenance an actionable register without a duplicate module redirect", () => {
    renderPropertyDetail({
      initialSection: "maintenance",
      propertyOverride: propertyWithMaintenance,
    });

    const panel = screen.getByRole("tabpanel", { name: /Maintenance/ });
    expect(within(panel).getByRole("heading", { name: "Maintenance" })).toBeTruthy();
    expect(within(panel).getByText("1 open · 0 overdue")).toBeTruthy();
    expect(
      within(panel).getByRole("link", { name: "New case" }).getAttribute("href"),
    ).toBe("/maintenance?action=create&propertyId=property-1");
    expect(within(panel).queryByRole("link", { name: /View all|Open maintenance/i })).toBeNull();
    expect(within(panel).queryByRole("heading", { name: "Maintenance cases" })).toBeNull();

    const pending = within(panel).getByRole("link", { name: /Kitchen sink repair/ });
    const completed = within(panel).getByRole("link", {
      name: /Fire extinguisher inspection/,
    });
    expect(
      pending.compareDocumentPosition(completed) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("uses a compact, contextual modal for the secondary archive action", async () => {
    renderPropertyDetail();

    fireEvent.pointerDown(screen.getByRole("button", { name: "More" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Archive" }));

    const dialog = screen.getByRole("dialog", {
      name: "Archive Nestory Residence?",
    });
    expect(dialog.className).toContain("sm:max-w-md");
    expect(
      within(dialog).getByText("1 active unit must be archived or moved first."),
    ).toBeTruthy();
    expect(
      within(dialog)
        .getByRole("link", { name: "Review active units" })
        .getAttribute("href"),
    ).toBe("/units?propertyId=property-1");
    expect(
      within(dialog).getByRole<HTMLButtonElement>("button", {
        name: "Archive property",
      }).disabled,
    ).toBe(true);
    expect(within(dialog).queryByText("Archive confirmation")).toBeNull();
    expect(within(dialog).queryByText("NST-001 / Serviced Apartment")).toBeNull();
    expect(
      within(dialog).queryByText(/Hide this property from active operational views/i),
    ).toBeNull();

  });

  it("combines photos and evidence in one Files workspace with local property document upload", () => {
    renderPropertyDetail({ propertyOverride: propertyWithFiles });

    fireEvent.click(screen.getByRole("tab", { name: "Files" }));

    const filesPanel = screen.getByRole("tabpanel", { name: "Files" });
    expect(within(filesPanel).getByRole("heading", { name: "Photos" })).toBeTruthy();
    expect(within(filesPanel).getByRole("button", { name: "Add property photo" })).toBeTruthy();
    expect(within(filesPanel).getAllByText("No property or unit photos yet.")).toHaveLength(1);
    expect(within(filesPanel).getByRole("heading", { name: "Property documents" })).toBeTruthy();
    const addDocument = within(filesPanel).getByRole("button", {
      name: "Add property document",
    });
    expect(within(filesPanel).queryByRole("link", { name: "Add property document" })).toBeNull();
    expect(within(filesPanel).getByText("property-insurance.pdf")).toBeTruthy();
    expect(within(filesPanel).getByRole("heading", { name: "Workflow evidence" })).toBeTruthy();
    expect(within(filesPanel).getByText("Cleaning expense")).toBeTruthy();
    expect(within(filesPanel).getByText("USD 85.00")).toBeTruthy();
    const evidenceLink = within(filesPanel).getByRole("link", {
      name: /cleaning-receipt\.pdf/i,
    });
    expect(evidenceLink.textContent).toContain("Khmer Home Services");
    expect(evidenceLink.getAttribute("href")).toBe(
      "/bills-expenses?submission=submission-1",
    );
    expect(within(filesPanel).queryByText("0 photos")).toBeNull();
    expect(within(filesPanel).queryByText("0 saved")).toBeNull();

    fireEvent.click(addDocument);

    const uploadDrawer = screen.getByRole("dialog", { name: "Upload document" });
    expect(
      within(uploadDrawer).getByRole("combobox", { name: /^Category/ }).textContent,
    ).toBe("Property record");
    expect(
      within(uploadDrawer).queryByRole("region", {
        name: "Document link and file limits",
      }),
    ).toBeNull();
    expect(
      within(uploadDrawer).queryByRole("heading", { name: "Record link" }),
    ).toBeNull();
    expect(
      within(uploadDrawer).queryByRole("combobox", { name: /^Property/ }),
    ).toBeNull();
    expect(
      within(uploadDrawer).queryByText(
        "Save a property-level document to Nestory Residence.",
      ),
    ).toBeNull();
    expect(
      within(uploadDrawer)
        .getByRole("form", { name: "Upload document form" })
        .querySelector<HTMLInputElement>('input[name="propertyId"]')?.value,
    ).toBe("property-1");
    expect(screen.queryByRole("tab", { name: "Reports" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Timeline" })).toBeNull();
  });
});

function renderPropertyDetail({
  initialSection,
  propertyOverride = property,
}: {
  initialSection?: "overview" | "units" | "maintenance" | "files";
  propertyOverride?: PropertyDetail;
} = {}) {
  return render(
    <PropertyDetailScreen
      initialSection={initialSection}
      ownerOptions={[]}
      property={propertyOverride}
    />,
  );
}

const propertyWithMaintenance = buildPropertyDetail({
  activeLeases: [
    {
      id: "lease-1",
      lease_end_date: "2027-05-31",
      lease_start_date: "2026-06-01",
      monthly_rent_amount: 1200,
      monthly_rent_currency: "USD",
      status: "active",
      tenant_name: "Dara Tenant",
      unit_id: "unit-1",
    },
  ],
  activeOwner: { label: "Jane Owner", personId: "person-owner" },
  ledgerEntries: [
    {
      amount: 1200,
      category: "Rent",
      currency: "USD",
      description: "August rent",
      direction: "income",
      id: "entry-income",
      transaction_date: "2026-08-01",
      unit_id: "unit-1",
    },
    {
      amount: 100,
      category: "Maintenance",
      currency: "USD",
      description: "AC service",
      direction: "expense",
      id: "entry-expense",
      transaction_date: "2026-08-02",
      unit_id: "unit-1",
    },
  ],
  maintenanceCases: [
    {
      actual_cost_amount: null,
      actual_cost_currency: "USD",
      category: "Safety inspection",
      due_date: "2026-08-11",
      due_time: "10:00",
      id: "case-completed",
      priority: "medium",
      status: "completed",
      title: "Fire extinguisher inspection",
      unit_id: "unit-1",
    },
    {
      actual_cost_amount: 125,
      actual_cost_currency: "USD",
      category: "Plumbing",
      due_date: "2026-08-15",
      due_time: "10:00",
      id: "case-pending",
      priority: "medium",
      status: "pending",
      title: "Kitchen sink repair",
      unit_id: "unit-1",
    },
  ],
  property: {
    address: "District 1",
    code: "NST-001",
    id: "property-1",
    name: "Nestory Residence",
    owner: "Jane Owner",
    property_type: "Serviced Apartment",
    status: "active",
  },
  recordCounts: {
    overdueMaintenanceCases: 0,
  },
  units: [
    {
      archived_at: null,
      current_rent_amount: 1200,
      current_rent_currency: "USD",
      floor: "4",
      id: "unit-1",
      status: "occupied",
      unit_number: "04-01",
    },
  ],
});

const propertyWithFiles = buildPropertyDetail({
  documents: [
    {
      category: "Insurance",
      file_name: "property-insurance.pdf",
      id: "doc-property",
      lease_id: null,
      ledger_entry_id: null,
      mime_type: "application/pdf",
      size_bytes: 1024,
      storage_path: "org/documents/property-insurance.pdf",
      task_id: null,
      timeline_event_id: null,
      unit_id: null,
      uploaded_at: "2026-08-01",
    },
    {
      category: "Paid cost evidence",
      file_name: "cleaning-receipt.pdf",
      id: "doc-expense",
      lease_id: null,
      ledger_entry_id: null,
      mime_type: "application/pdf",
      size_bytes: 2048,
      storage_path: "org/paid-cost-evidence/hash",
      task_id: null,
      timeline_event_id: null,
      unit_id: null,
      uploaded_at: "2026-08-02",
    },
  ],
  expenseEvidence: [
    {
      currency: "USD",
      customer_category: "cleaning",
      id: "submission-1",
      internal_cost_amount: 85,
      source_id: null,
      source_type: "general",
      status: "reversed",
      supporting_document_id: "doc-expense",
      vendor_label: "Khmer Home Services",
    },
  ],
  ledgerEntries: [],
  property: {
    address: "District 1",
    code: "NST-001",
    id: "property-1",
    name: "Nestory Residence",
    owner: "Jane Owner",
    property_type: "Serviced Apartment",
    status: "active",
  },
  units: [],
});

const property = {
  ...propertyWithMaintenance,
  counts: {
    ...propertyWithMaintenance.counts,
    maintenanceCases: 0,
    openMaintenanceCases: 0,
    overdueMaintenanceCases: 0,
  },
  recentMaintenanceCases: [],
};

const propertyWithWorkflowAttention: PropertyDetail = {
  ...property,
  financialSummary: {
    ...property.financialSummary,
    noiDisplay: { primary: "USD 1,100.00" },
    periodLabel: "Trailing 12 months",
  },
  healthIndicators: [
    {
      description: "A current owner/person link is available for reports and follow-up.",
      id: "owner",
      label: "Owner linked",
      tone: "success",
    },
    {
      description: "One open maintenance case is overdue.",
      id: "open-maintenance",
      label: "Maintenance overdue",
      tone: "danger",
    },
    {
      description: "No property evidence or supporting documents are attached yet.",
      id: "evidence",
      label: "Evidence missing",
      tone: "warning",
    },
    {
      description: "Property income covers recorded expenses in the trailing 12 months.",
      id: "noi",
      label: "NOI positive",
      tone: "success",
    },
  ],
  nextAction: {
    description: "Annual inspection is overdue under this property.",
    href: "/maintenance?archiveState=all&taskId=case-overdue",
    label: "Review overdue issue",
    tone: "danger",
  },
};

const propertyWithoutActiveLease: PropertyDetail = {
  ...property,
  activeLeases: [],
  counts: {
    ...property.counts,
    activeLeases: 0,
  },
  nextAction: {
    description: "Create or review leases so occupancy and rent roll are connected.",
    href: "/leases?action=create&propertyId=property-1",
    label: "Add lease",
    tone: "warning",
  },
};

const propertyWithAccentNextAction: PropertyDetail = {
  ...property,
  nextAction: {
    description: "The core record is connected. Review maintenance or add the next case.",
    href: "/maintenance?action=create&propertyId=property-1",
    label: "Log maintenance case",
    tone: "accent",
  },
};
