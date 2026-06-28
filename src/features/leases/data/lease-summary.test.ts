import { describe, expect, it } from "vitest";
import { buildLeaseSummary } from "@/features/leases/data/lease-summary";

const property = {
  code: "CR",
  id: "property-1",
  name: "Central Residence",
};

const unit = {
  floor: "12",
  id: "unit-1",
  property_id: "property-1",
  status: "occupied",
  unit_number: "12A",
};

const lease = {
  archived_at: null,
  deposit_amount: 1200,
  deposit_currency: "USD" as const,
  id: "lease-1",
  lease_end_date: "2027-01-31",
  lease_start_date: "2026-02-01",
  monthly_rent_amount: 850,
  monthly_rent_currency: "USD" as const,
  property_id: "property-1",
  status: "active",
  tenant_name: "Dara Tenant",
  unit_id: "unit-1",
};

describe("buildLeaseSummary", () => {
  it("preserves tenant_name compatibility and formats operational labels", () => {
    const summary = buildLeaseSummary({
      lease,
      property,
      unit,
    });

    expect(summary.tenantName).toBe("Dara Tenant");
    expect(summary.partySummary).toBe("Dara Tenant");
    expect(summary.unitLabel).toBe("Unit 12A / Floor 12");
    expect(summary.statusLabel).toBe("Active");
    expect(summary.depositLabel).toBe("USD 1,200.00");
  });

  it("uses legacy lease data when no normalized deposit row exists", () => {
    const summary = buildLeaseSummary({
      lease: {
        ...lease,
        deposit_amount: null,
        deposit_currency: null,
      },
      property,
      unit,
    });

    expect(summary.depositDisplay).toBeUndefined();
    expect(summary.depositLabel).toBe("No deposit recorded");
  });

  it("builds linked operational context for the lease inspector", () => {
    const summary = buildLeaseSummary({
      activity: [
        {
          action: "lease_updated",
          actionLabel: "Updated",
          createdAt: "2026-06-10T00:00:00.000Z",
          details: [],
          entityLabel: "Dara Tenant",
          href: "/leases?leaseId=lease-1",
          id: "activity-1",
          recordLabel: "Dara Tenant",
          tone: "neutral",
        },
      ],
      deposits: [
        {
          amount: 1200,
          archived_at: null,
          currency: "USD",
          deposit_type: "security",
          id: "deposit-1",
          lease_id: "lease-1",
          status: "held",
        },
      ],
      documents: [
        {
          category: "agreement",
          file_name: "lease-agreement.pdf",
          id: "document-1",
          lease_id: "lease-1",
          mime_type: "application/pdf",
          size_bytes: 1024,
          uploaded_at: "2026-02-01T00:00:00.000Z",
          url: "https://example.com/lease-agreement.pdf",
        },
      ],
      lease,
      ledgerEntryCount: 3,
      occupancies: [
        {
          actual_move_in_date: "2026-02-01",
          actual_move_out_date: null,
          archived_at: null,
          id: "occupancy-1",
          lease_id: "lease-1",
          scheduled_move_in_date: null,
          scheduled_move_out_date: null,
          status: "active",
          unit_id: "unit-1",
        },
      ],
      parties: [
        {
          archived_at: null,
          ended_on: null,
          id: "party-1",
          is_primary: true,
          lease_id: "lease-1",
          party_role: "tenant",
          person_id: "person-1",
          person_name: "Dara Sok",
          primary_email: "dara@example.com",
          primary_phone: null,
        },
      ],
      property,
      terms: [
        {
          archived_at: null,
          end_date: "2027-01-31",
          id: "term-1",
          lease_id: "lease-1",
          rent_amount: 850,
          rent_currency: "USD",
          start_date: "2026-02-01",
          status: "active",
          term_sequence: 1,
        },
      ],
      timelineEvents: [
        {
          event_date: "2026-02-01",
          event_type: "move_in",
          id: "event-1",
          lease_id: "lease-1",
          title: "Move-in completed",
        },
      ],
      unit,
    });

    expect(summary.partySummary).toBe("Dara Sok");
    expect(summary.recordCounts).toEqual({
      documents: 1,
      ledgerEntries: 3,
      parties: 1,
      timelineEvents: 1,
    });
    expect(summary.hrefs.addLedgerEntry).toBe(
      "/ledger?action=create&propertyId=property-1&unitId=unit-1",
    );
    expect(summary.hrefs.timeline).toBe(
      "/timeline?archiveState=all&propertyId=property-1&query=Dara+Tenant&unitId=unit-1",
    );
    expect(summary.parties[0]).toMatchObject({
      contactLabel: "dara@example.com",
      href: "/people?archiveState=all&personId=person-1",
      label: "Dara Sok",
      roleLabel: "Tenant",
    });
    expect(summary.terms[0]).toMatchObject({
      datesLabel: "01 Feb 2026 - 31 Jan 2027",
      rentLabel: "USD 850.00",
      statusLabel: "Active",
    });
    expect(summary.deposits[0]).toMatchObject({
      amountLabel: "USD 1,200.00",
      statusLabel: "Held",
      typeLabel: "Security",
    });
    expect(summary.documents[0]).toMatchObject({
      fileName: "lease-agreement.pdf",
      linkedRecordLabel: "Lease evidence",
      url: "https://example.com/lease-agreement.pdf",
    });
    expect(summary.timeline[0]).toMatchObject({
      href: "/timeline?archiveState=all&eventId=event-1",
      title: "Move-in completed",
      typeLabel: "Move In",
    });
    expect(summary.riskIndicators.map((risk) => risk.id)).toEqual([
      "party",
      "unit",
      "end",
      "deposit",
      "documents",
    ]);
    expect(summary.nextAction).toMatchObject({
      href: "/ledger?propertyId=property-1&query=Dara+Tenant&unitId=unit-1",
      label: "Review ledger",
    });
    expect(summary.activity[0]).toMatchObject({
      actionLabel: "Updated",
      id: "activity-1",
    });
  });
});
