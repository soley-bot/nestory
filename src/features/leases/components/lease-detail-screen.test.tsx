/* @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LeaseDetailScreen } from "@/features/leases/components/lease-detail-screen";
import { buildLeaseSummary } from "@/features/leases/data/lease-summary";
import type { LeaseRecordSection } from "@/features/leases/lease-detail-route";

vi.mock("@/features/leases/actions", () => ({
  archiveLeaseAction: async () => ({}),
  createLeaseAction: async () => ({}),
  recordCurrentLeaseOccupancyEvidenceAction: async () => ({}),
  recordLeaseDepositEventAction: async () => ({}),
  restoreLeaseAction: async () => ({}),
  reverseLeaseDepositEventAction: async () => ({}),
  scheduleFutureRentTermAction: async () => ({}),
  transitionLeaseLifecycleAction: async () => ({}),
  updateLeaseAction: async () => ({}),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

afterEach(cleanup);

describe("LeaseDetailScreen", () => {
  it("provides one ordered record with four sections", () => {
    renderDetail("overview");

    const nav = screen.getByRole("navigation", { name: "Lease record sections" });
    expect(within(nav).getAllByRole("link").map((link) => link.textContent)).toEqual([
      "Overview",
      "Rent & deposit",
      "Occupancy",
      "Files & history",
    ]);
    expect(screen.getByRole("heading", { level: 1, name: "Alice Tenant" })).not.toBeNull();
    expect(screen.getAllByText(/Riverside House \/ Unit 2A/).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Lease lifecycle" })).not.toBeNull();
    expect(screen.getByRole("link", { name: "Renew or change rent" }).getAttribute("href"))
      .toBe("/leases/lease-1?section=rent");
    expect(screen.getByRole("button", { name: "Give notice" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "Terminate lease" })).not.toBeNull();
  });

  it("uses the checked lifecycle workflow instead of editing status directly", async () => {
    const user = userEvent.setup();
    renderDetail("overview");

    await user.click(screen.getByRole("button", { name: "Give notice" }));

    const dialog = screen.getByRole("dialog", { name: "Record notice" });
    expect(within(dialog).getByLabelText("Notice date")).not.toBeNull();
    expect(within(dialog).getByLabelText("Planned move-out date")).not.toBeNull();
    expect(within(dialog).getByLabelText("Evidence note")).not.toBeNull();
    expect(within(dialog).queryByRole("combobox", { name: "Status" })).toBeNull();
    expect(
      dialog.querySelector<HTMLInputElement>('input[name="expectedOccupancyId"]')
        ?.value,
    ).toBe("occupancy-1");
    expect(
      dialog.querySelector<HTMLInputElement>('input[name="transition"]')?.value,
    ).toBe("give_notice");
  });

  it.each([
    ["rent", "Rent & deposit", "Schedule future rent"],
    ["occupancy", "Occupancy", "Occupancy evidence"],
    ["files", "Files & history", "Lease agreement.pdf"],
  ] as const)("keeps %s workflows in the %s section", (section, heading, content) => {
    renderDetail(section);

    expect(screen.getByRole("heading", { name: heading })).not.toBeNull();
    expect(screen.getByText(content)).not.toBeNull();
  });
});

function renderDetail(activeSection: LeaseRecordSection) {
  render(
    <LeaseDetailScreen
      activeSection={activeSection}
      canConfigure
      lease={makeLease()}
      propertyOptions={[{ id: "property-1", label: "RIVER - Riverside House" }]}
      tenantOptions={[
        {
          archived: false,
          description: "Tenant",
          id: "person-1",
          label: "Alice Tenant",
          roles: ["tenant"],
        },
      ]}
      unitOptions={[{ id: "unit-1", label: "Unit 2A", propertyId: "property-1" }]}
    />,
  );
}

function makeLease() {
  const lease = buildLeaseSummary({
    deposits: [
      {
        amount: 1200,
        archived_at: null,
        currency: "USD",
        deposit_type: "security",
        events: [],
        id: "deposit-1",
        lease_id: "lease-1",
        status: "active",
      },
    ],
    lease: {
      archived_at: null,
      deposit_amount: 1200,
      deposit_currency: "USD",
      id: "lease-1",
      lease_end_date: "2027-06-30",
      lease_start_date: "2026-07-01",
      monthly_rent_amount: 850,
      monthly_rent_currency: "USD",
      primary_tenant_person_id: "person-1",
      property_id: "property-1",
      status: "active",
      tenant_name: "Alice Tenant",
      unit_id: "unit-1",
    },
    property: { code: "RIVER", id: "property-1", name: "Riverside House" },
    terms: [
      {
        archived_at: null,
        end_date: "2027-06-30",
        id: "term-1",
        lease_id: "lease-1",
        payment_frequency: "monthly",
        rent_amount: 850,
        rent_currency: "USD",
        rent_due_day: 10,
        start_date: "2026-07-01",
        status: "active",
        term_sequence: 1,
      },
    ],
    unit: {
      floor: "2",
      id: "unit-1",
      property_id: "property-1",
      status: "occupied",
      unit_number: "2A",
    },
  });

  lease.occupancies = [
    {
      actualLabel: "01 Jul 2026 - Current",
      datesLabel: "01 Jul 2026 - Current",
      evidenceLabel: "Accepted",
      evidenceState: "accepted",
      id: "occupancy-1",
      residentLabel: "Alice Tenant",
      scheduledLabel: "01 Jul 2026 - 30 Jun 2027",
      statusLabel: "Occupied",
      unitHref: "/units/unit-1",
      unitLabel: "Unit 2A",
    },
  ];
  lease.documents = [
    {
      category: "Lease",
      fileName: "Lease agreement.pdf",
      id: "document-1",
      linkedRecordLabel: "Lease evidence",
      mimeType: "application/pdf",
      sizeBytes: 1024,
      uploadedAt: "2026-07-01T00:00:00.000Z",
      url: "https://example.com/lease.pdf",
    },
  ];

  return lease;
}
