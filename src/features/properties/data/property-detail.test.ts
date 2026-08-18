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
  it("keeps a whole-property draft lease separate from active lease and occupancy data", () => {
    const detail = buildPropertyDetail({
      activeLeases: [
        {
          id: "lease-draft-whole-property",
          lease_end_date: "2027-01-31",
          lease_start_date: "2026-02-01",
          monthly_rent_amount: 850,
          monthly_rent_currency: "USD",
          status: "draft",
          tenant_name: "Dara Tenant",
          unit_id: null,
        },
      ],
      ledgerEntries: [],
      property: {
        ...property,
        rental_structure: "single_space",
      },
      units: [],
    });

    expect(detail.activeLeases).toEqual([]);
    expect(detail.counts.activeLeases).toBe(0);
    expect(detail.occupiedUnits).toBe(0);
    expect(detail.propertyDraftLease).toMatchObject({
      href: "/leases/lease-draft-whole-property",
      id: "lease-draft-whole-property",
      tenantName: "Dara Tenant",
    });
  });

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
    });
    expect(detail.unitsList).toEqual([
      expect.objectContaining({
        currentRent: "USD 450.00",
        currentRentDisplay: expect.objectContaining({
          primary: "USD 450.00",
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

  it("uses the active lease as the source of truth for unit occupancy and rent", () => {
    const detail = buildPropertyDetail({
      activeLeases: [
        {
          id: "lease-1",
          lease_end_date: "2028-01-31",
          lease_start_date: "2026-08-01",
          monthly_rent_amount: 850,
          monthly_rent_currency: "USD",
          status: "active",
          tenant_name: "Dara Chan",
          unit_id: "unit-1",
        },
      ],
      ledgerEntries: [],
      property,
      units: [
        {
          archived_at: null,
          current_rent_amount: null,
          current_rent_currency: null,
          floor: "1",
          id: "unit-1",
          status: "vacant",
          unit_number: "A-01",
        },
      ],
    });

    expect(detail.occupiedUnits).toBe(1);
    expect(detail.unitSummary).toBe("1/1 occupied");
    expect(detail.unitsList[0]).toMatchObject({
      attention: "—",
      leaseEndLabel: "31 Jan 2028",
      monthlyRent: "USD 850.00",
      occupancy: "Occupied",
      tenantName: "Dara Chan",
    });
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
      href: "/maintenance?action=create&propertyId=property-1",
      label: "Log maintenance case",
    });
  });

  it("separates property documents from source-linked workflow evidence", () => {
    const detail = buildPropertyDetail({
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
      property,
      units: [],
    });

    expect(detail.propertyDocuments.map((document) => document.fileName)).toEqual([
      "property-insurance.pdf",
    ]);
    expect(detail.workflowEvidence).toEqual([
      expect.objectContaining({
        amountLabel: "USD 85.00",
        fileName: "cleaning-receipt.pdf",
        href: "/bills-expenses?submission=submission-1",
        sourceLabel: "Cleaning expense",
        statusLabel: "Reversed",
        vendorLabel: "Khmer Home Services",
      }),
    ]);
  });

  it("prioritizes rent review when an active lease has no recent income", () => {
    const detail = buildPropertyDetail({
      activeLeases: [
        {
          id: "lease-rent-review",
          lease_end_date: "2027-05-31",
          lease_start_date: "2026-06-01",
          monthly_rent_amount: 1200,
          monthly_rent_currency: "USD",
          status: "active",
          tenant_name: "Dara Tenant",
          unit_id: "unit-rent-review",
        },
      ],
      activeOwner: {
        label: "Jane Owner",
        personId: "person-owner",
      },
      ledgerEntries: [],
      property,
      units: [
        {
          archived_at: null,
          current_rent_amount: 1200,
          current_rent_currency: "USD",
          floor: "4",
          id: "unit-rent-review",
          status: "occupied",
          unit_number: "04-01",
        },
      ],
    });

    expect(detail.nextAction).toMatchObject({
      href: "/properties/property-1/finance",
      label: "Review rent",
      tone: "warning",
    });
  });

  it("does not make optional evidence the primary property action", () => {
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
      documents: [],
      ledgerEntries: [
        {
          amount: 1200,
          category: "Rent",
          currency: "USD",
          description: null,
          direction: "income",
          id: "entry-1",
          transaction_date: "2026-06-01",
          unit_id: "unit-1",
        },
      ],
      property,
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

    expect(detail.nextAction).toMatchObject({
      href: "/maintenance?action=create&propertyId=property-1",
      label: "Log maintenance case",
      tone: "accent",
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
      addDocument: "/documents?action=create&category=Property+record&propertyId=property-1",
      addLedgerEntry: "/ledger?action=create&propertyId=property-1",
      addLease: "/leases?action=create&propertyId=property-1",
      addTimelineEvent: "/timeline?action=create&propertyId=property-1",
      addUnit: "/units?action=create&propertyId=property-1",
      documents: "/documents?archiveState=all&propertyId=property-1",
      ownerPerson: "/people/person-owner",
      units: "/units?archiveState=all&propertyId=property-1",
    });
  });
});
