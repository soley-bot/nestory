import { describe, expect, it } from "vitest";
import {
  buildPropertyDetail,
  buildPropertyDetailHrefs,
} from "@/features/properties/data/property-detail";

const property = {
  address: "District 1",
  code: "NST-001",
  id: "property-1",
  name: "Nestory Residence",
  owner: "Owner Group A",
  property_type: "Serviced Apartment",
  status: "active",
};

describe("buildPropertyDetail", () => {
  it("keeps a property useful when no unit children exist", () => {
    const detail = buildPropertyDetail({
      ledgerEntries: [],
      property,
      units: [],
    });

    expect(detail.unitSummary).toBe("Property-only");
    expect(detail.activeUnitCount).toBe(0);
    expect(detail.archivedUnitCount).toBe(0);
    expect(detail.totalUnitCount).toBe(0);
    expect(detail.unitsList).toEqual([]);
  });

  it("formats optional units with rent, status, and archive state", () => {
    const detail = buildPropertyDetail({
      ledgerEntries: [
        {
          amount: 1200,
          category: "Rent",
          currency: "USD",
          description: null,
          direction: "income",
          id: "entry-income",
          transaction_date: "2026-06-01",
          unit_id: "unit-1",
        },
        {
          amount: 200,
          category: "Repair",
          currency: "USD",
          description: null,
          direction: "expense",
          id: "entry-expense",
          transaction_date: "2026-06-03",
          unit_id: "unit-1",
        },
      ],
      property,
      units: [
        {
          archived_at: null,
          current_rent_amount: 450,
          current_rent_currency: "USD",
          floor: "3",
          id: "unit-1",
          status: "occupied",
          unit_number: "03-01",
        },
        {
          archived_at: "2026-06-16T00:00:00.000Z",
          current_rent_amount: null,
          current_rent_currency: null,
          floor: null,
          id: "unit-2",
          status: "vacant",
          unit_number: "03-02",
        },
      ],
    });

    expect(detail.unitSummary).toBe("1/1 occupied, 1 archived");
    expect(detail.netIncome).toMatchObject({
      primary: "USD 1,000.00",
      secondary: "KHR 4,100,000",
    });
    expect(detail.unitsList).toEqual([
      expect.objectContaining({
        currentRent: "USD 450.00",
        currentRentDisplay: expect.objectContaining({
          primary: "USD 450.00",
          secondary: "KHR 1,845,000",
        }),
        floor: "3",
        isArchived: false,
        status: "Occupied",
        unitNumber: "03-01",
      }),
      expect.objectContaining({
        currentRent: "No rent set",
        floor: "Not set",
        isArchived: true,
        status: "Vacant",
        unitNumber: "03-02",
      }),
    ]);
  });

  it("builds linked property context, risk, next action, and route contracts", () => {
    const detail = buildPropertyDetail({
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
      activeOwner: {
        label: "Jane Owner",
        personId: "person-owner",
      },
      documents: [
        {
          category: "Lease",
          file_name: "signed-lease.pdf",
          id: "doc-1",
          lease_id: "lease-1",
          ledger_entry_id: null,
          mime_type: "application/pdf",
          size_bytes: 2048,
          storage_path: "org/property/doc.pdf",
          timeline_event_id: null,
          unit_id: "unit-1",
          uploaded_at: "2026-06-05",
          url: "https://signed.example/doc-1",
        },
      ],
      ledgerEntries: [
        {
          amount: 1200,
          category: "Rent",
          currency: "USD",
          description: "June rent",
          direction: "income",
          id: "entry-1",
          transaction_date: "2026-06-01",
          unit_id: "unit-1",
        },
        {
          amount: 100,
          category: "Maintenance",
          currency: "USD",
          description: "AC service",
          direction: "expense",
          id: "entry-2",
          transaction_date: "2026-06-08",
          unit_id: "unit-1",
        },
      ],
      ownerHistory: [
        {
          archived_at: null,
          ended_on: null,
          id: "owner-link-1",
          is_primary: true,
          ownership_label: "Primary",
          person_id: "person-owner",
          person_name: "Jane Owner",
          started_on: "2026-01-01",
        },
      ],
      property,
      recentLedgerEntries: [
        {
          amount: 100,
          category: "Maintenance",
          currency: "USD",
          description: "AC service",
          direction: "expense",
          id: "entry-2",
          transaction_date: "2026-06-08",
          unit_id: "unit-1",
        },
      ],
      recentTimelineEvents: [
        {
          cost_amount: 100,
          cost_currency: "USD",
          description: "Serviced unit AC",
          event_date: "2026-06-08",
          event_type: "Repair",
          id: "event-1",
          lease_id: null,
          ledger_entry_id: "entry-2",
          title: "AC service",
          unit_id: "unit-1",
        },
      ],
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

    expect(detail.owner).toBe("Jane Owner");
    expect(detail.hasActiveOwnerLink).toBe(true);
    expect(detail.activeLeases[0]).toMatchObject({
      href: "/leases?archiveState=all&leaseId=lease-1&query=Dara+Tenant",
      tenantName: "Dara Tenant",
      unitHref: "/units/unit-1",
      unitLabel: "Unit 04-01",
    });
    expect(detail.documents[0]).toMatchObject({
      fileName: "signed-lease.pdf",
      linkedRecordHref: "/leases?archiveState=all&leaseId=lease-1",
      linkedRecordLabel: "Lease",
    });
    expect(detail.financialSummary).toMatchObject({
      expenseUsd: 100,
      incomeUsd: 1200,
      maintenanceExpenseUsd: 100,
      noiUsd: 1100,
    });
    expect(detail.healthIndicators.map((indicator) => indicator.id)).toContain(
      "evidence",
    );
    expect(detail.nextAction).toMatchObject({
      href: "/timeline?action=create&propertyId=property-1",
      label: "Log next event",
    });
  });
});

describe("buildPropertyDetailHrefs", () => {
  it("builds supported linked create and focus hrefs", () => {
    expect(
      buildPropertyDetailHrefs({
        activeOwner: { personId: "person-owner" },
        propertyId: "property-1",
      }),
    ).toMatchObject({
      addLedgerEntry: "/ledger?action=create&propertyId=property-1",
      addLease: "/leases?action=create&propertyId=property-1",
      addTimelineEvent: "/timeline?action=create&propertyId=property-1",
      addUnit: "/units?action=create&propertyId=property-1",
      ownerPerson: "/people?archiveState=all&personId=person-owner",
      units: "/units?archiveState=all&propertyId=property-1",
    });
  });
});
