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
  primary_tenant_person_id: "person-1",
  property_id: "property-1",
  status: "active",
  tenant_name: "Dara Tenant",
  unit_id: "unit-1",
};

describe("buildLeaseSummary", () => {
  it("uses the projected tenant name and formats operational labels", () => {
    const summary = buildLeaseSummary({
      lease,
      property,
      unit,
    });

    expect(summary.tenantName).toBe("Dara Tenant");
    expect(summary.formValues.tenantPersonId).toBe("person-1");
    expect(summary.partySummary).toBe("Dara Tenant");
    expect(summary.unitLabel).toBe("Unit 12A / Floor 12");
    expect(summary.statusLabel).toBe("Active");
    expect(summary.depositLabel).toBe("USD 1,200.00");
    expect(summary.nextAction).toMatchObject({
      href: "/documents?action=create&category=Lease&leaseId=lease-1&propertyId=property-1&unitId=unit-1",
      label: "Attach evidence",
    });
  });

  it("shows no deposit when the lease has no deposit agreement", () => {
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

  it("surfaces exact term authority and rent readiness without fallback inference", () => {
    const summary = buildLeaseSummary({
      lease,
      property,
      readiness: {
        policy_id: "policy-1",
        reason_code: "ready",
        readiness_status: "ready",
        repair_context: {
          policyId: "policy-1",
          termId: "term-1",
        },
        term_id: "term-1",
      },
      terms: [
        {
          archived_at: null,
          end_date: "2027-01-31",
          id: "term-1",
          lease_id: "lease-1",
          payment_frequency: "monthly",
          rent_amount: 850,
          rent_currency: "USD",
          rent_due_day: 10,
          start_date: "2026-02-01",
          status: "active",
          term_sequence: 2,
        },
      ],
      unit,
    });

    expect(summary.formValues).toMatchObject({
      paymentFrequency: "monthly",
      rentDueDay: 10,
      termStatus: "active",
    });
    expect(summary.rentReadiness).toMatchObject({
      label: "Rent ready",
      policyId: "policy-1",
      reasonCode: "ready",
      termId: "term-1",
      tone: "success",
    });
    expect(summary.terms[0]).toMatchObject({
      datesLabel: "01 Feb 2026 - 31 Jan 2027",
      dueLabel: "Day 10",
      paymentFrequencyLabel: "Monthly",
    });
  });

  it("keeps metadata edits bound to the active term before a future term starts", () => {
    const summary = buildLeaseSummary({
      lease,
      property,
      terms: [
        {
          archived_at: null,
          end_date: "2028-01-31",
          id: "term-upcoming",
          lease_id: "lease-1",
          payment_frequency: "quarterly",
          rent_amount: 925,
          rent_currency: "USD",
          rent_due_day: 15,
          start_date: "2027-02-01",
          status: "upcoming",
          term_sequence: 2,
        },
        {
          archived_at: null,
          end_date: "2027-01-31",
          id: "term-active",
          lease_id: "lease-1",
          payment_frequency: "monthly",
          rent_amount: 850,
          rent_currency: "USD",
          rent_due_day: 10,
          start_date: "2026-02-01",
          status: "active",
          term_sequence: 1,
        },
      ],
      unit,
    });

    expect(summary.formValues).toMatchObject({
      leaseEndDate: "2027-01-31",
      leaseStartDate: "2026-02-01",
      monthlyRentAmount: 850,
      paymentFrequency: "monthly",
      rentDueDay: 10,
      termStatus: "active",
    });
  });

  it("uses the resolver-selected term for display and editing", () => {
    const summary = buildLeaseSummary({
      lease: {
        ...lease,
        lease_end_date: "2028-01-31",
      },
      property,
      readiness: {
        policy_id: "policy-2",
        reason_code: "ready",
        readiness_status: "ready",
        repair_context: {
          policyId: "policy-2",
          termId: "term-upcoming",
        },
        term_id: "term-upcoming",
      },
      terms: [
        {
          archived_at: null,
          end_date: "2026-07-31",
          id: "term-active",
          lease_id: "lease-1",
          payment_frequency: "monthly",
          rent_amount: 850,
          rent_currency: "USD",
          rent_due_day: 10,
          start_date: "2026-02-01",
          status: "active",
          term_sequence: 1,
        },
        {
          archived_at: null,
          end_date: "2028-01-31",
          id: "term-upcoming",
          lease_id: "lease-1",
          payment_frequency: "quarterly",
          rent_amount: 925,
          rent_currency: "USD",
          rent_due_day: 15,
          start_date: "2026-08-01",
          status: "upcoming",
          term_sequence: 2,
        },
      ],
      unit,
    });

    expect(summary).toMatchObject({
      endDateLabel: "31 Jan 2028",
      rentLabel: "USD 925.00",
      rentUsd: 925,
      startDateLabel: "01 Aug 2026",
      termLabel: "01 Aug 2026 - 31 Jan 2028",
    });
    expect(summary.formValues).toMatchObject({
      leaseEndDate: "2028-01-31",
      leaseStartDate: "2026-08-01",
      monthlyRentAmount: 925,
      paymentFrequency: "quarterly",
      rentDueDay: 15,
      termStatus: "upcoming",
    });
  });

  it("keeps specific readiness blockers visible", () => {
    const summary = buildLeaseSummary({
      lease,
      property,
      readiness: {
        policy_id: null,
        reason_code: "no_authoritative_term",
        readiness_status: "blocked",
        repair_context: null,
        term_id: null,
      },
      unit,
    });

    expect(summary.rentReadiness).toMatchObject({
      label: "Authoritative term missing",
      reasonCode: "no_authoritative_term",
      repairLabel: "Create an authoritative lease term.",
      tone: "danger",
    });
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
          events: [
            { id: "deposit-event-1", event_type: "received", event_date: "2026-07-01", amount: 500, currency: "USD", reference: "RCPT-1", reversal_of_id: null },
            { id: "deposit-event-2", event_type: "refunded", event_date: "2026-07-02", amount: 100, currency: "USD", reference: "REF-1", reversal_of_id: null },
          ],
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
          actual_move_in_confidence: "confirmed",
          actual_move_in_kind: "known",
          actual_move_out_date: null,
          actual_move_out_confidence: "confirmed",
          actual_move_out_kind: "open_current",
          archived_at: null,
          business_lifecycle: "occupied",
          evidence_state: "accepted",
          id: "occupancy-1",
          lease_id: "lease-1",
          participants: [
            {
              business_lifecycle: "present",
              evidence_state: "accepted",
              id: "participant-1",
            },
          ],
          scheduled_move_in_date: null,
          scheduled_move_in_confidence: "unknown",
          scheduled_move_in_kind: "unknown",
          scheduled_move_out_date: null,
          scheduled_move_out_confidence: "unknown",
          scheduled_move_out_kind: "unknown",
          status: "occupied",
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
    expect(summary.hrefs.addDocument).toBe(
      "/documents?action=create&category=Lease&leaseId=lease-1&propertyId=property-1&unitId=unit-1",
    );
    expect(summary.hrefs.documents).toBe(
      "/documents?archiveState=all&leaseId=lease-1",
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
    expect(summary.occupancies[0]).toMatchObject({
      actualLabel: "01 Feb 2026 - Current",
      evidenceLabel: "Accepted",
      residentLabel: "Confirmed resident",
      scheduledLabel: "Not recorded",
    });
    expect(summary.deposits[0]).toMatchObject({
      amountLabel: "USD 1,200.00",
      statusLabel: "Held",
      typeLabel: "Security",
      heldBalanceDisplay: { primary: "USD 400.00" },
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

  it("keeps scheduled occupancy separate and does not call unknown actual evidence current", () => {
    const summary = buildLeaseSummary({
      lease,
      occupancies: [
        {
          actual_move_in_date: null,
          actual_move_in_confidence: "unknown",
          actual_move_in_kind: "unknown",
          actual_move_out_date: null,
          actual_move_out_confidence: "unknown",
          actual_move_out_kind: "unknown",
          archived_at: null,
          business_lifecycle: "reserved",
          evidence_state: "accepted",
          id: "occupancy-scheduled",
          lease_id: "lease-1",
          participants: [],
          scheduled_move_in_date: "2026-01-20",
          scheduled_move_in_confidence: "confirmed",
          scheduled_move_in_kind: "known",
          scheduled_move_out_date: "2027-01-20",
          scheduled_move_out_confidence: "confirmed",
          scheduled_move_out_kind: "known",
          status: "reserved",
          unit_id: "unit-1",
        },
      ],
      property,
      unit,
    });

    expect(summary.occupancies[0]).toMatchObject({
      actualLabel: "Not recorded",
      evidenceLabel: "Accepted",
      residentLabel: "Resident evidence missing",
      scheduledLabel: "20 Jan 2026 - 20 Jan 2027",
    });
  });

  it("places the accepted repair successor before its superseded predecessor", () => {
    const summary = buildLeaseSummary({
      lease,
      occupancies: [
        {
          actual_move_in_date: null,
          actual_move_out_date: null,
          archived_at: null,
          business_lifecycle: "reserved",
          evidence_state: "superseded",
          id: "occupancy-predecessor",
          lease_id: "lease-1",
          participants: [],
          scheduled_move_in_date: "2026-01-20",
          scheduled_move_out_date: null,
          status: "reserved",
          unit_id: "unit-1",
        },
        {
          actual_move_in_date: "2026-02-01",
          actual_move_in_kind: "known",
          actual_move_out_date: null,
          actual_move_out_kind: "open_current",
          archived_at: null,
          business_lifecycle: "occupied",
          evidence_state: "accepted",
          id: "occupancy-successor",
          lease_id: "lease-1",
          participants: [
            {
              business_lifecycle: "present",
              evidence_state: "accepted",
              id: "participant-successor",
            },
          ],
          scheduled_move_in_date: "2026-01-20",
          scheduled_move_out_date: null,
          status: "occupied",
          unit_id: "unit-1",
        },
      ],
      property,
      unit,
    });

    expect(summary.occupancies.map((occupancy) => occupancy.id)).toEqual([
      "occupancy-successor",
      "occupancy-predecessor",
    ]);
    expect(summary.occupancies[0]).toMatchObject({
      actualLabel: "01 Feb 2026 - Current",
      evidenceState: "accepted",
      residentLabel: "Confirmed resident",
    });
  });
});
