import { describe, expect, it, vi } from "vitest";
import {
  buildSettlementsByInvoiceId,
  fetchAllActionableRows,
  fetchRowsByIdBatches,
  isRentGenerationSource,
  loadCommercialDocumentLinks,
  mapCommercialDocumentLinks,
  mergeRowsById,
  selectCurrentFinanceLeaseBillingRulesByLeaseId,
  toExpenseSubmissionSummary,
  toTenantInvoice,
} from "@/features/finance-operations/data/finance-operations";
import type { Database } from "@/types/database";

describe("Finance lease billing authority", () => {
  it("does not select a historical policy snapshot as current billing setup", () => {
    type BillingRow = Database["public"]["Tables"]["lease_billing_terms"]["Row"];
    const rows = [
      {
        archived_at: null,
        created_at: "2026-01-01T00:00:00.000Z",
        effective_from: "2026-01-01",
        effective_to: "2026-08-31",
        id: "historical-current",
        lease_id: "lease-1",
        rent_calculation_timezone: "UTC",
        rule_source: "historical_policy_snapshot",
      },
      {
        archived_at: null,
        created_at: "2026-08-01T00:00:00.000Z",
        effective_from: "2026-09-01",
        effective_to: "2027-08-31",
        id: "authoritative-successor",
        lease_id: "lease-1",
        rent_calculation_timezone: "UTC",
        rule_source: "lease_default_v1",
      },
    ] as BillingRow[];

    expect(
      selectCurrentFinanceLeaseBillingRulesByLeaseId(
        rows,
        new Date("2026-08-15T12:00:00.000Z"),
      ),
    ).toEqual(new Map());
  });
});

describe("fetchAllActionableRows", () => {
  it("keeps actionable rows reachable beyond the old 250-row cap", async () => {
    const source = Array.from({ length: 620 }, (_, id) => ({ id }));
    const fetchPage = vi.fn(async (from: number, to: number) => ({
      data: source.slice(from, to + 1),
      error: null,
    }));

    await expect(fetchAllActionableRows(fetchPage, 250)).resolves.toEqual({
      data: source,
      error: null,
    });
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage).toHaveBeenNthCalledWith(3, 500, 749);
  });
});

describe("fetchRowsByIdBatches", () => {
  it("scopes every page to requested invoice ids and returns more than 1,000 lines", async () => {
    const invoiceIds = Array.from({ length: 205 }, (_, index) =>
      `invoice-${index.toString().padStart(3, "0")}`,
    );
    const source = invoiceIds.flatMap((invoiceId) =>
      Array.from({ length: 6 }, (_, lineIndex) => ({
        id: `${invoiceId}-line-${lineIndex}`,
        invoiceId,
      })),
    );
    const fetchPage = vi.fn(
      async (batchIds: readonly string[], from: number, to: number) => ({
        data: source
          .filter((row) => batchIds.includes(row.invoiceId))
          .slice(from, to + 1),
        error: null,
      }),
    );

    await expect(
      fetchRowsByIdBatches(invoiceIds, fetchPage, 100, 500),
    ).resolves.toEqual({ data: source, error: null });
    expect(fetchPage).toHaveBeenCalledTimes(5);
    expect(fetchPage.mock.calls.every(([ids]) => ids.length <= 100)).toBe(true);
    expect(fetchPage).toHaveBeenNthCalledWith(
      2,
      invoiceIds.slice(0, 100),
      500,
      999,
    );
    expect(fetchPage).toHaveBeenNthCalledWith(
      5,
      invoiceIds.slice(200),
      0,
      499,
    );
  });
});

describe("mergeRowsById", () => {
  it("keeps an older actionable invoice beyond a newer 250-row history window", () => {
    const history = Array.from({ length: 250 }, (_, index) => ({
      id: `other-property-${index}`,
      propertyId: "property-2",
    }));
    const olderOpenInvoice = {
      id: "older-open-invoice",
      propertyId: "property-1",
    };

    const merged = mergeRowsById([olderOpenInvoice], history);

    expect(merged).toHaveLength(251);
    expect(merged).toContainEqual(olderOpenInvoice);
  });

  it("deduplicates actionable invoices already present in recent history", () => {
    expect(
      mergeRowsById(
        [{ id: "invoice-1", status: "open" }],
        [{ id: "invoice-1", status: "history" }],
      ),
    ).toEqual([{ id: "invoice-1", status: "open" }]);
  });
});

describe("isRentGenerationSource", () => {
  it("keeps lease-owned rent provenance visible", () => {
    expect(isRentGenerationSource("lease_rules_v1")).toBe(true);
    expect(isRentGenerationSource("unknown_source")).toBe(false);
  });
});

describe("toExpenseSubmissionSummary", () => {
  it("resolves an archived renamed tenant recharge category without crossing into owner expense", () => {
    const submission = {
      adjusts_submission_id: null,
      customer_category: "custom_water_recharge_7d1b",
      customer_total_amount: 95,
      expense_date: "2026-08-10",
      id: "submission-custom-tenant-category",
      internal_cost_amount: 80,
      internal_markup_amount: 15,
      previously_approved_amount: null,
      property_id: "property-1",
      reconciliation_source_id: null,
      recorded_total_amount: null,
      reference: "Water recharge 18",
      responsibility: "tenant",
      reviewed_at: null,
      review_reason: null,
      reversal_reason: null,
      source_id: null,
      source_type: "general",
      status: "submitted",
      submitted_at: "2026-08-10T08:00:00Z",
      submitted_by: "finance-member-user-1",
      unit_id: null,
      vendor_label: "City Water",
    } as Database["public"]["Tables"]["expense_submissions"]["Row"];

    const summary = toExpenseSubmissionSummary(
      submission,
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      [
        {
          archivedAt: null,
          code: "custom_water_recharge_7d1b",
          displayLabel: "Owner water service",
          id: "owner-category-same-code",
          isActive: true,
          isDefault: false,
          namespace: "owner_expense",
          reportingGroup: "utilities",
          sortOrder: 50,
        },
        {
          archivedAt: "2026-08-11T10:00:00Z",
          code: "custom_water_recharge_7d1b",
          displayLabel: "Resident water recharge",
          id: "tenant-category-renamed-archived",
          isActive: false,
          isDefault: false,
          namespace: "tenant_billing",
          reportingGroup: "utility_reimbursement",
          sortOrder: 50,
        },
      ],
    );

    expect(summary).toMatchObject({
      category: "custom_water_recharge_7d1b",
      categoryLabel: "Resident water recharge",
      responsibility: "tenant",
    });
  });

  it("resolves an archived renamed owner category without crossing into tenant billing", () => {
    const submission = {
      adjusts_submission_id: null,
      customer_category: "custom_courtyard_4f2a",
      customer_total_amount: 125,
      expense_date: "2026-08-08",
      id: "submission-custom-owner-category",
      internal_cost_amount: 125,
      internal_markup_amount: 0,
      previously_approved_amount: null,
      property_id: "property-1",
      reconciliation_source_id: null,
      recorded_total_amount: null,
      reference: "Receipt 124",
      responsibility: "owner",
      reviewed_at: null,
      review_reason: null,
      reversal_reason: null,
      source_id: null,
      source_type: "general",
      status: "submitted",
      submitted_at: "2026-08-08T08:00:00Z",
      submitted_by: "finance-member-user-1",
      unit_id: null,
      vendor_label: "Courtyard Vendor",
    } as Database["public"]["Tables"]["expense_submissions"]["Row"];

    const summary = toExpenseSubmissionSummary(
      submission,
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      new Map(),
      [
        {
          archivedAt: null,
          code: "custom_courtyard_4f2a",
          displayLabel: "Tenant courtyard charge",
          id: "tenant-category-same-code",
          isActive: true,
          isDefault: false,
          namespace: "tenant_billing",
          reportingGroup: "other",
          sortOrder: 50,
        },
        {
          archivedAt: "2026-08-09T10:00:00Z",
          code: "custom_courtyard_4f2a",
          displayLabel: "Courtyard upkeep",
          id: "owner-category-renamed-archived",
          isActive: false,
          isDefault: false,
          namespace: "owner_expense",
          reportingGroup: "maintenance",
          sortOrder: 50,
        },
      ],
    );

    expect(summary).toMatchObject({
      category: "custom_courtyard_4f2a",
      categoryLabel: "Courtyard upkeep",
    });
  });

  it("keeps a submitted expense visible after its label records are archived", () => {
    const submission = {
      adjusts_submission_id: null,
      customer_category: "maintenance",
      customer_total_amount: 125,
      expense_date: "2026-08-08",
      id: "submission-1",
      internal_cost_amount: 100,
      internal_markup_amount: 25,
      previously_approved_amount: null,
      property_id: "property-1",
      reconciliation_source_id: "source-1",
      recorded_total_amount: 100,
      reference: "Receipt 123",
      responsibility: "owner",
      reviewed_at: "2026-08-09T08:30:00Z",
      review_reason: null,
      reversal_reason: null,
      source_id: "task-1",
      source_type: "maintenance_task",
      status: "submitted",
      submitted_at: "2026-08-08T08:00:00Z",
      submitted_by: "finance-member-user-1",
      unit_id: "unit-1",
      vendor_label: "Archived Vendor",
    } as Database["public"]["Tables"]["expense_submissions"]["Row"];

    const summary = toExpenseSubmissionSummary(
      submission,
      new Map([
        [
          "property-1",
          {
            archived_at: "2026-08-08T09:00:00Z",
            code: "P-001",
            id: "property-1",
            name: "Archived Property",
          },
        ],
      ]),
      new Map([
        [
          "unit-1",
          {
            archived_at: "2026-08-08T09:00:00Z",
            id: "unit-1",
            property_id: "property-1",
            unit_number: "A-01",
          },
        ],
      ]),
      new Map([["source-1", "BANK · Archived operating account"]]),
      new Map([
        [
          "submission-1",
          {
            documentId: "document-1",
            fileName: "receipt.pdf",
            mimeType: "application/pdf",
            sha256:
              "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            sizeBytes: 128,
          },
        ],
      ]),
      new Map([
        [
          "task-1",
          {
            completed_at: "2026-08-08T07:30:00Z",
            description: "Replace the failed pump and verify pressure.",
            id: "task-1",
            status: "completed",
            title: "Garden Court pump replacement",
          },
        ],
      ]),
      new Map([["finance-member-user-1", "finance.member@nestory.com"]]),
    );

    expect(summary).toMatchObject({
      fundingSourceLabel: "BANK · Archived operating account",
      id: "submission-1",
      maintenanceTask: {
        completedAt: "2026-08-08T07:30:00Z",
        description: "Replace the failed pump and verify pressure.",
        href: "/maintenance?archiveState=all&taskId=task-1",
        status: "completed",
        title: "Garden Court pump replacement",
      },
      evidence: {
        sha256:
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        sizeBytes: 128,
      },
      reviewedAt: "2026-08-09T08:30:00Z",
      status: "submitted",
      submittedByLabel: "finance.member@nestory.com",
      submittedByUserId: "finance-member-user-1",
    });
    expect(summary.propertyLabel).toContain("Archived Property");
    expect(summary.unitLabel).toContain("A-01");
  });

  it("uses stable fallbacks instead of dropping rows with unavailable labels", () => {
    const submission = {
      adjusts_submission_id: null,
      customer_category: "other",
      customer_total_amount: 10,
      expense_date: "2026-08-08",
      id: "submission-2",
      internal_cost_amount: 10,
      internal_markup_amount: 0,
      previously_approved_amount: null,
      property_id: "missing-property",
      reconciliation_source_id: null,
      recorded_total_amount: null,
      reference: "Manual evidence",
      responsibility: "owner",
      review_reason: null,
      reversal_reason: null,
      source_id: null,
      source_type: "general",
      status: "rejected",
      submitted_at: "2026-08-08T08:00:00Z",
      unit_id: "missing-unit",
      vendor_label: "Vendor",
    } as Database["public"]["Tables"]["expense_submissions"]["Row"];

    expect(
      toExpenseSubmissionSummary(
        submission,
        new Map(),
        new Map(),
        new Map(),
        new Map(),
      ),
    ).toMatchObject({
      propertyLabel: "Property unavailable",
      unitLabel: "Unit unavailable",
    });
  });
});

describe("commercial document links", () => {
  const organizationId = "11111111-1111-4111-8111-111111111111";
  const invoiceId = "22222222-2222-4222-8222-222222222222";
  const paymentId = "33333333-3333-4333-8333-333333333333";
  const artifactId = "44444444-4444-4444-8444-444444444444";

  it("maps a published invoice and a historically reversed IPS receipt without storage metadata", () => {
    // Break caught: leaking private artifact fields or hiding immutable published history.
    const links = mapCommercialDocumentLinks(organizationId, [
      {
        document_number: "INV-2026-0042",
        id: artifactId,
        organization_id: organizationId,
        publication_status: "published",
        published_at: "2026-08-20T10:00:00Z",
        presentation_snapshot: {
          issuer: {
            contactEmail: "billing@ips.example",
            contactPhone: "+855 12 345 678",
          },
          note: "Include the invoice number with payment.",
          paymentInstructions: "Bank transfer to IPS operating account.",
        },
        source_id: invoiceId,
        source_kind: "invoice",
        storage_path: "private/path.pdf",
      },
      {
        document_number: "RCT-2026-004182",
        id: "55555555-5555-4555-8555-555555555555",
        organization_id: organizationId,
        publication_status: "published",
        published_at: "2026-08-20T11:00:00Z",
        source_id: paymentId,
        source_kind: "receipt",
        storage_path: "private/receipt.pdf",
      },
    ] as never, [invoiceId], [paymentId]);

    expect(links.invoices.get(invoiceId)).toEqual({
      artifactId,
      href: `/api/finance/documents/${artifactId}`,
      publicationStatus: "published",
      publishedAt: "2026-08-20T10:00:00Z",
    });
    expect(links.receipts.get(paymentId)).toEqual({
      artifactId: "55555555-5555-4555-8555-555555555555",
      href: "/api/finance/documents/55555555-5555-4555-8555-555555555555",
      publicationStatus: "published",
      publishedAt: "2026-08-20T11:00:00Z",
    });
    expect(links.receiptNumbers.get(paymentId)).toBe("RCT-2026-004182");
    expect(links.invoicePublicationSnapshots.get(invoiceId)).toEqual({
      contactEmail: "billing@ips.example",
      contactPhone: "+855 12 345 678",
      note: "Include the invoice number with payment.",
      paymentInstructions: "Bank transfer to IPS operating account.",
    });
    expect(Object.keys(links.invoices.get(invoiceId) ?? {})).toEqual([
      "artifactId",
      "href",
      "publicationStatus",
      "publishedAt",
    ]);
  });

  it("does not create a receipt link for direct-to-owner settlements", () => {
    // Break caught: treating an owner confirmation as an IPS-issued tenant receipt.
    const links = mapCommercialDocumentLinks(organizationId, [
      {
        document_number: "RCT-2026-004182",
        id: artifactId,
        organization_id: organizationId,
        publication_status: "published",
        published_at: "2026-08-20T11:00:00Z",
        source_id: paymentId,
        source_kind: "receipt",
      },
    ] as never, [invoiceId], []);

    expect(links.receipts.get(paymentId)).toBeUndefined();
    expect(links.receiptNumbers.get(paymentId)).toBeUndefined();
  });

  it("maps failed and missing artifacts without download hrefs and excludes a foreign organization row", () => {
    // Break caught: a failure, missing document, or cross-org row becoming downloadable.
    const links = mapCommercialDocumentLinks(organizationId, [
      {
        document_number: "INV-2026-0042",
        id: artifactId,
        organization_id: organizationId,
        publication_status: "failed",
        published_at: null,
        presentation_snapshot: {
          issuer: { contactEmail: "billing@ips.example" },
          paymentInstructions: "Bank transfer to IPS operating account.",
        },
        source_id: invoiceId,
        source_kind: "invoice",
      },
      {
        document_number: "RCT-foreign",
        id: "66666666-6666-4666-8666-666666666666",
        organization_id: "77777777-7777-4777-8777-777777777777",
        publication_status: "published",
        published_at: "2026-08-20T11:00:00Z",
        source_id: paymentId,
        source_kind: "receipt",
      },
    ] as never, [invoiceId], [paymentId]);

    expect(links.invoices.get(invoiceId)).toEqual({
      artifactId,
      href: null,
      publicationStatus: "failed",
      publishedAt: null,
    });
    expect(links.receipts.get(paymentId)).toEqual({
      artifactId: null,
      href: null,
      publicationStatus: "not_published",
      publishedAt: null,
    });
    expect(links.invoicePublicationSnapshots.get(invoiceId)).toBeNull();
  });

  it("normalizes only complete published invoice snapshots", () => {
    // Break caught: receipt or malformed artifact JSON leaking into immutable invoice details.
    const malformed = mapCommercialDocumentLinks(organizationId, [
      {
        document_number: "INV-2026-0042",
        id: artifactId,
        organization_id: organizationId,
        publication_status: "published",
        published_at: "2026-08-20T10:00:00Z",
        presentation_snapshot: {
          issuer: { contactEmail: "billing@ips.example" },
          paymentInstructions: 42,
        },
        source_id: invoiceId,
        source_kind: "invoice",
      },
      {
        document_number: "RCT-2026-004182",
        id: "55555555-5555-4555-8555-555555555555",
        organization_id: organizationId,
        publication_status: "published",
        published_at: "2026-08-20T11:00:00Z",
        presentation_snapshot: {
          issuer: {
            contactEmail: "billing@ips.example",
            contactPhone: "+855 12 345 678",
          },
          note: "Receipt-only note",
          paymentInstructions: "Receipt-only instructions",
        },
        source_id: paymentId,
        source_kind: "receipt",
      },
    ] as never, [invoiceId], [paymentId]);
    const missing = mapCommercialDocumentLinks(organizationId, [], [invoiceId], [paymentId]);

    expect(malformed.invoicePublicationSnapshots.get(invoiceId)).toBeNull();
    expect(malformed.invoicePublicationSnapshots.get(paymentId)).toBeUndefined();
    expect(missing.invoicePublicationSnapshots.get(invoiceId)).toBeNull();
  });

  it("uses one organization-scoped artifact read for every loaded invoice and IPS payment id", async () => {
    // Break caught: N+1 artifact reads or a query that can return another organization's rows.
    let selectedIds: readonly string[] = [];
    const query = {
      eq: vi.fn().mockReturnThis(),
      in: vi.fn((_column: string, ids: readonly string[]) => {
        selectedIds = ids;
        return query;
      }),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockResolvedValue({ data: [], error: null }),
      select: vi.fn().mockReturnThis(),
      then: vi.fn((resolve: (value: unknown) => unknown) =>
        resolve({ data: selectedIds.length > 0 ? [] : null, error: null }),
      ),
    };
    const client = { from: vi.fn().mockReturnValue(query) };

    const links = await loadCommercialDocumentLinks(
      client as never,
      organizationId,
      [invoiceId, "88888888-8888-4888-8888-888888888888"],
      [paymentId, "99999999-9999-4999-8999-999999999999"],
    );

    expect(links.invoices).toHaveLength(2);
    expect(links.receipts).toHaveLength(2);

    expect(client.from).toHaveBeenCalledTimes(1);
    expect(client.from).toHaveBeenCalledWith("tenant_commercial_document_artifacts");
    expect(query.select).toHaveBeenCalledWith(
      "id, organization_id, source_kind, source_id, document_number, publication_status, published_at, presentation_snapshot",
    );
    expect(query.eq).toHaveBeenCalledWith("organization_id", organizationId);
    expect(query.in).toHaveBeenCalledWith("source_id", [
      invoiceId,
      "88888888-8888-4888-8888-888888888888",
      paymentId,
      "99999999-9999-4999-8999-999999999999",
    ]);
    expect(query.range).toHaveBeenCalledWith(0, 499);
  });

  it("loads published artifacts beyond the Data API row cap in bounded source batches", async () => {
    // Break caught: one unpaginated .in() query silently dropping artifacts after max_rows.
    const invoiceIds = Array.from(
      { length: 1205 },
      (_, index) => `invoice-${index.toString().padStart(4, "0")}`,
    );
    const rows = invoiceIds.map((sourceId, index) => ({
      document_number: `INV-${index.toString().padStart(4, "0")}`,
      id: `artifact-${index.toString().padStart(4, "0")}`,
      organization_id: organizationId,
      presentation_snapshot: null,
      publication_status: "published",
      published_at: "2026-08-20T11:00:00Z",
      source_id: sourceId,
      source_kind: "invoice",
    }));
    let selectedIds: readonly string[] = [];
    const queries: Array<{
      range: ReturnType<typeof vi.fn>;
    }> = [];
    const client = {
      from: vi.fn(() => {
        const query = {
          eq: vi.fn().mockReturnThis(),
          in: vi.fn((_column: string, ids: readonly string[]) => {
            selectedIds = ids;
            return query;
          }),
          order: vi.fn().mockReturnThis(),
          range: vi.fn((from: number, to: number) =>
            Promise.resolve({
              data: rows
                .filter((row) => selectedIds.includes(row.source_id))
                .slice(from, to + 1),
              error: null,
            }),
          ),
          select: vi.fn().mockReturnThis(),
          then: vi.fn((resolve: (value: unknown) => unknown) =>
            resolve({ data: rows.slice(0, 1000), error: null }),
          ),
        };
        queries.push(query);
        return query;
      }),
    };

    const links = await loadCommercialDocumentLinks(
      client as never,
      organizationId,
      invoiceIds,
      [],
    );

    expect(links.invoices.get(invoiceIds.at(-1)!)).toMatchObject({
      artifactId: rows.at(-1)!.id,
      publicationStatus: "published",
    });
    expect(client.from).toHaveBeenCalledTimes(13);
    expect(queries.every((query) => query.range.mock.calls.length === 1)).toBe(
      true,
    );
  });
});

describe("commercial document summary composition", () => {
  const invoiceId = "22222222-2222-4222-8222-222222222222";
  const paymentId = "33333333-3333-4333-8333-333333333333";
  const publishedReceipt = {
    artifactId: "55555555-5555-4555-8555-555555555555",
    href: "/api/finance/documents/55555555-5555-4555-8555-555555555555",
    publicationStatus: "published" as const,
    publishedAt: "2026-08-20T11:00:00Z",
  };

  it("keeps a published PDF on a voided invoice", () => {
    // Break caught: voiding an invoice removing its immutable published evidence.
    const invoice = toTenantInvoice(
      {
        balance_due: 0,
        billing_period_start: "2026-08-01",
        collected_by_owner: 0,
        collection_route: "through_ips",
        due_date: "2026-08-05",
        id: invoiceId,
        invoice_number: "INV-2026-0042",
        issue_date: "2026-08-01",
        lease_id: "lease-1",
        occupant_labels: ["Dara Tenant"],
        paid_through_ips: 125,
        payment_status: "voided",
        property_id: "property-1",
        recipient_label: "Dara Tenant",
        total_amount: 125,
        unit_id: "unit-1",
      } as never,
      new Map([["property-1", { code: "HOME", id: "property-1", name: "Riverside Home" }]]),
      new Map([["unit-1", { id: "unit-1", property_id: "property-1", unit_number: "A-01" }]]),
      new Map(),
      new Map(),
      new Map(),
      new Map([[invoiceId, publishedReceipt]]),
      new Map([
        [
          invoiceId,
          {
            contactEmail: "billing@ips.example",
            contactPhone: "+855 12 345 678",
            note: "Include the invoice number with payment.",
            paymentInstructions: "Bank transfer to IPS operating account.",
          },
        ],
      ]),
    )[0];

    expect(invoice).toMatchObject({
      paymentStatus: "voided",
      pdf: {
        href: "/api/finance/documents/55555555-5555-4555-8555-555555555555",
        publicationStatus: "published",
      },
      publicationSnapshot: {
        contactEmail: "billing@ips.example",
        contactPhone: "+855 12 345 678",
        note: "Include the invoice number with payment.",
        paymentInstructions: "Bank transfer to IPS operating account.",
      },
    });
  });

  it("keeps an immutable receipt and number on an original IPS payment later reversed", () => {
    // Break caught: reversal hiding the original IPS receipt or replacing its receipt number.
    const settlements = buildSettlementsByInvoiceId(
      [
        {
          amount: 125,
          date: "2026-08-10",
          id: paymentId,
          invoiceId,
          reference: "BANK-001",
          reversalOfId: null,
          reversalReason: null,
          route: "through_ips",
        },
        {
          amount: -125,
          date: "2026-08-12",
          id: "66666666-6666-4666-8666-666666666666",
          invoiceId,
          reference: "REV-001",
          reversalOfId: paymentId,
          reversalReason: "Duplicate payment",
          route: "through_ips",
        },
      ],
      {
        invoices: new Map(),
        invoicePublicationSnapshots: new Map(),
        receiptNumbers: new Map([[paymentId, "RCT-2026-004182"]]),
        receipts: new Map([[paymentId, publishedReceipt]]),
      },
    );

    expect(settlements.get(invoiceId)).toEqual([
      expect.objectContaining({
        id: paymentId,
        isReversed: true,
        receipt: publishedReceipt,
        receiptNumber: "RCT-2026-004182",
      }),
    ]);
  });

  it("emits explicit null receipt fields for a direct-to-owner settlement", () => {
    // Break caught: direct-owner confirmations inheriting an IPS receipt state.
    const settlements = buildSettlementsByInvoiceId(
      [
        {
          amount: 125,
          date: "2026-08-10",
          id: "77777777-7777-4777-8777-777777777777",
          invoiceId,
          reference: "OWNER-001",
          reversalOfId: null,
          reversalReason: null,
          route: "direct_to_owner",
        },
      ],
      {
        invoices: new Map(),
        invoicePublicationSnapshots: new Map(),
        receiptNumbers: new Map(),
        receipts: new Map(),
      },
    );

    expect(settlements.get(invoiceId)).toEqual([
      expect.objectContaining({ receipt: null, receiptNumber: null, route: "direct_to_owner" }),
    ]);
  });
});
