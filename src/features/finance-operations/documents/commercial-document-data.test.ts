import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import {
  loadTenantInvoicePdfModel,
  loadTenantReceiptPdfModel,
  type InvoicePublicationInput,
} from "@/features/finance-operations/documents/commercial-document-data";

const organizationId = "10000000-0000-4000-8000-000000000001";
const otherOrganizationId = "20000000-0000-4000-8000-000000000001";
const invoiceId = "30000000-0000-4000-8000-000000000001";
const paymentId = "40000000-0000-4000-8000-000000000001";

const publicationInput: InvoicePublicationInput = {
  contactEmail: "billing@ips.example",
  contactPhone: "+855 12 345 678",
  note: "Include the Invoice number with payment.",
  paymentInstructions: "Bank transfer to IPS operating account 001-9182.",
};

afterEach(() => {
  vi.useRealTimers();
});

describe("commercial document authoritative snapshot loading", () => {
  it("rejects an Invoice source hidden by organization scope instead of accepting caller identity", async () => {
    const client = fakeDataClient({
      rpcError: { message: "tenant_commercial_document_source_not_found" },
    });

    await expect(
      loadTenantInvoicePdfModel(
        client as unknown as SupabaseClient<Database>,
        otherOrganizationId,
        invoiceId,
        publicationInput,
      ),
    ).rejects.toThrow("Tenant Invoice source is unavailable.");
  });

  it("rejects a void Invoice so a lifecycle change cannot create a new artifact", async () => {
    const client = fakeDataClient({
      source: invoiceSource({ source_state: "voided" }),
    });

    await expect(
      loadTenantInvoicePdfModel(
        client as unknown as SupabaseClient<Database>,
        organizationId,
        invoiceId,
        publicationInput,
      ),
    ).rejects.toThrow("Voided tenant invoices cannot be published.");
  });

  it("preserves RPC decimal strings and authoritative Invoice line order without floating-point conversion", async () => {
    const client = fakeDataClient({
      source: invoiceSource({
        invoice: {
          billing_period_end: "2026-08-31",
          billing_period_start: "2026-08-01",
          collection_route: "through_ips",
          currency: "USD",
          due_date: "2026-08-10",
          issue_date: "2026-08-05",
          lifecycle: "issued",
          total_amount: "850.10",
        },
        lines: [
          {
            amount: "0.10",
            description: "Exact fractional adjustment",
            id: "31000000-0000-4000-8000-000000000002",
            label: "Adjustment",
            line_type: "other",
            sort_order: 2,
          },
          {
            amount: "850.00",
            description: "August rent",
            id: "31000000-0000-4000-8000-000000000001",
            label: "Monthly rent",
            line_type: "rent",
            sort_order: 10,
          },
        ],
      }),
    });

    const model = await loadTenantInvoicePdfModel(
      client as unknown as SupabaseClient<Database>,
      organizationId,
      invoiceId,
      publicationInput,
    );

    expect(model).toEqual({
      billingPeriodEnd: "2026-08-31",
      billingPeriodStart: "2026-08-01",
      currency: "USD",
      dueDate: "2026-08-10",
      invoiceNumber: "INV / 2026 #0042",
      issueDate: "2026-08-05",
      issuer: {
        contactEmail: "billing@ips.example",
        contactPhone: "+855 12 345 678",
        name: "Independent Property Service",
      },
      lines: [
        {
          amount: "0.10",
          description: "Exact fractional adjustment",
          label: "Adjustment",
        },
        {
          amount: "850.00",
          description: "August rent",
          label: "Monthly rent",
        },
      ],
      note: "Include the Invoice number with payment.",
      occupantLabels: [],
      paymentInstructions: "Bank transfer to IPS operating account 001-9182.",
      propertyLabel: "PEAK / The Peak Residence",
      recipientLabel: "Sokha Chan",
      totalAmount: "850.10",
      unitLabel: "Unit 2807",
      voided: false,
    });
  });

  it("loads authoritative Invoice occupant labels through the caller client with organization and Invoice scope", async () => {
    const client = fakeDataClient({
      tenantInvoice: {
        occupant_labels: ["Maly Chan", "Dara Chan"],
      },
    });

    const model = await loadTenantInvoicePdfModel(
      client as unknown as SupabaseClient<Database>,
      organizationId,
      invoiceId,
      publicationInput,
    );

    expect(model.occupantLabels).toEqual(["Maly Chan", "Dara Chan"]);
  });

  it("builds an authoritative direct-to-owner Invoice because collection route restricts Receipts, not Invoice publication", async () => {
    const client = fakeDataClient({
      source: invoiceSource({
        invoice: {
          billing_period_end: "2026-08-31",
          billing_period_start: "2026-08-01",
          collection_route: "direct_to_owner",
          currency: "USD",
          due_date: "2026-08-10",
          issue_date: "2026-08-05",
          lifecycle: "issued",
          total_amount: "850.00",
        },
      }),
    });

    const model = await loadTenantInvoicePdfModel(
      client as unknown as SupabaseClient<Database>,
      organizationId,
      invoiceId,
      publicationInput,
    );

    expect(model.invoiceNumber).toBe("INV / 2026 #0042");
    expect(model.paymentInstructions).toBe(
      "Bank transfer to IPS operating account 001-9182.",
    );
  });

  it.each([
    ["a missing logo", null, null],
    [
      "an unsupported logo",
      `${organizationId}/logos/50000000-0000-4000-8000-000000000001.png`,
      new Blob([Uint8Array.from([0x00, 0x01, 0x02])], {
        type: "application/octet-stream",
      }),
    ],
  ])("falls back to the organization name for %s", async (_case, logoPath, logo) => {
    const client = fakeDataClient({
      logo,
      organization: {
        logo_storage_path: logoPath,
        name: "Independent Property Service",
        operational_timezone: "Asia/Phnom_Penh",
      },
      source: invoiceSource(),
    });

    const model = await loadTenantInvoicePdfModel(
      client as unknown as SupabaseClient<Database>,
      organizationId,
      invoiceId,
      publicationInput,
    );

    expect(model.issuer).toEqual({
      contactEmail: "billing@ips.example",
      contactPhone: "+855 12 345 678",
      name: "Independent Property Service",
    });
  });

  it("rejects a reversal payment instead of issuing an ordinary Receipt", async () => {
    const client = fakeDataClient({
      source: receiptSource({
        payment: {
          amount: "350.00",
          amount_previously_paid: "200.00",
          received_date: "2026-08-21",
          reference: "ABA-001",
          remaining_balance: "300.00",
          reversal_of_id: "41000000-0000-4000-8000-000000000001",
        },
        source_state: "reversal",
      }),
    });

    await expect(
      loadTenantReceiptPdfModel(
        client as unknown as SupabaseClient<Database>,
        organizationId,
        paymentId,
      ),
    ).rejects.toThrow("Reversal payments cannot be published as tenant receipts.");
  });

  it.each([
    ["a direct-to-owner collection route", "direct-to-owner"],
    ["a non-IPS reconciliation source", "non-IPS"],
  ])("rejects %s when the authoritative source RPC excludes it", async (_case, reason) => {
    const client = fakeDataClient({
      rpcError: {
        message: `tenant_commercial_document_source_not_found:${reason}`,
      },
    });

    await expect(
      loadTenantReceiptPdfModel(
        client as unknown as SupabaseClient<Database>,
        organizationId,
        paymentId,
      ),
    ).rejects.toThrow("Tenant Receipt source is unavailable.");
  });

  it("uses authoritative signed settlement strings for sequential partial payments with a prior reversal", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-21T09:45:00.000Z"));
    const client = fakeDataClient({
      source: receiptSource({
        allocations: [
          {
            allocation_order: 1,
            amount: "300.00",
            description: "August rent",
            invoice_line_id: "31000000-0000-4000-8000-000000000001",
            label: "Monthly rent",
          },
          {
            allocation_order: 2,
            amount: "50.00",
            description: null,
            invoice_line_id: "31000000-0000-4000-8000-000000000002",
            label: "Parking",
          },
        ],
      }),
    });

    const model = await loadTenantReceiptPdfModel(
      client as unknown as SupabaseClient<Database>,
      organizationId,
      paymentId,
    );

    expect(model).toEqual({
      allocations: [
        { amount: "300.00", label: "Monthly rent - August rent" },
        { amount: "50.00", label: "Parking" },
      ],
      amountPreviouslyPaid: "200.00",
      currency: "USD",
      invoiceNumber: "INV / 2026 #0042",
      invoiceTotal: "850.00",
      issuer: { name: "Independent Property Service" },
      paymentAmount: "350.00",
      paymentDate: "2026-08-21",
      paymentReference: "ABA-001",
      propertyLabel: "PEAK / The Peak Residence",
      publicationDate: "2026-08-21",
      receiptNumber: "RCT / 2026 #0018",
      recipientLabel: "Sokha Chan",
      remainingBalance: "300.00",
      reversed: false,
      unitLabel: "Unit 2807",
    });
  });

  it("derives the Receipt publication date from the organization's operational timezone across UTC midnight", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-21T17:30:00.000Z"));
    const client = fakeDataClient({
      organization: {
        logo_storage_path: null,
        name: "Independent Property Service",
        operational_timezone: "Asia/Phnom_Penh",
      },
      source: receiptSource(),
    });

    const model = await loadTenantReceiptPdfModel(
      client as unknown as SupabaseClient<Database>,
      organizationId,
      paymentId,
    );

    expect(model.publicationDate).toBe("2026-08-22");
  });
});

function invoiceSource(overrides: Record<string, unknown> = {}) {
  return {
    artifact: null,
    document_number: "INV / 2026 #0042",
    invoice: {
      billing_period_end: "2026-08-31",
      billing_period_start: "2026-08-01",
      collection_route: "through_ips",
      currency: "USD",
      due_date: "2026-08-10",
      issue_date: "2026-08-05",
      lifecycle: "issued",
      total_amount: "850.00",
    },
    issuer: {
      name: "Independent Property Service",
      organization_id: organizationId,
    },
    lines: [
      {
        amount: "850.00",
        description: "August rent",
        id: "31000000-0000-4000-8000-000000000001",
        label: "Monthly rent",
        line_type: "rent",
        sort_order: 1,
      },
    ],
    property: {
      code: "PEAK",
      id: "60000000-0000-4000-8000-000000000001",
      name: "The Peak Residence",
      unit_id: "70000000-0000-4000-8000-000000000001",
      unit_number: "2807",
    },
    recipient: {
      email: "sokha@example.test",
      kind: "tenant",
      label: "Sokha Chan",
      person_id: "80000000-0000-4000-8000-000000000001",
      phone: "+855 10 000 001",
    },
    source_id: invoiceId,
    source_kind: "invoice",
    source_state: "current",
    ...overrides,
  };
}

function receiptSource(overrides: Record<string, unknown> = {}) {
  return {
    allocations: [
      {
        allocation_order: 1,
        amount: "350.00",
        description: "August rent",
        invoice_line_id: "31000000-0000-4000-8000-000000000001",
        label: "Monthly rent",
      },
    ],
    artifact: null,
    document_number: "RCT / 2026 #0018",
    invoice: {
      currency: "USD",
      id: invoiceId,
      invoice_number: "INV / 2026 #0042",
      lifecycle: "issued",
      total_amount: "850.00",
    },
    issuer: {
      name: "Independent Property Service",
      organization_id: organizationId,
    },
    payment: {
      amount: "350.00",
      amount_previously_paid: "200.00",
      received_date: "2026-08-21",
      reference: "ABA-001",
      remaining_balance: "300.00",
      reversal_of_id: null,
    },
    property: {
      code: "PEAK",
      id: "60000000-0000-4000-8000-000000000001",
      name: "The Peak Residence",
      unit_id: "70000000-0000-4000-8000-000000000001",
      unit_number: "2807",
    },
    recipient: {
      kind: "tenant",
      label: "Sokha Chan",
      person_id: "80000000-0000-4000-8000-000000000001",
    },
    source_id: paymentId,
    source_kind: "receipt",
    source_state: "current",
    ...overrides,
  };
}

function fakeDataClient({
  logo = null,
  organization = {
    logo_storage_path: null,
    name: "Independent Property Service",
    operational_timezone: "Asia/Phnom_Penh",
  },
  rpcError = null,
  source = invoiceSource(),
  tenantInvoice = { occupant_labels: [] },
}: {
  logo?: Blob | null;
  organization?: {
    logo_storage_path: string | null;
    name: string;
    operational_timezone: string;
  };
  rpcError?: { message: string } | null;
  source?: Record<string, unknown>;
  tenantInvoice?: { occupant_labels: string[] };
} = {}) {
  const records: Record<string, unknown> = {
    organizations: organization,
    people: { display_name: "Sokha Chan" },
    properties: { code: "PEAK", name: "The Peak Residence" },
    tenant_invoices: tenantInvoice,
    units: { unit_number: "2807" },
  };
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const query = {
        eq(column: string, value: unknown) {
          filters[column] = value;
          return query;
        },
        select() {
          return query;
        },
        async single() {
          if (
            table === "tenant_invoices" &&
            (filters.organization_id !== organizationId ||
              filters.id !== invoiceId)
          ) {
            throw new Error("Tenant Invoice occupant lookup was not exactly scoped.");
          }
          return { data: records[table] ?? null, error: null };
        },
      };
      return query;
    },
    async rpc(
      name: string,
      args: Record<string, unknown>,
    ): Promise<{ data: unknown; error: { message: string } | null }> {
      expect(name).toBe("get_tenant_commercial_document_publication_source");
      expect(args).toEqual({
        p_organization_id:
          args.p_organization_id === otherOrganizationId
            ? otherOrganizationId
            : organizationId,
        p_source_id:
          args.p_source_kind === "receipt" ? paymentId : invoiceId,
        p_source_kind: args.p_source_kind,
      });
      return { data: rpcError ? null : source, error: rpcError };
    },
    storage: {
      from(bucket: string) {
        expect(bucket).toBe("organization-assets");
        return {
          async download() {
            return logo
              ? { data: logo, error: null }
              : { data: null, error: { message: "not found" } };
          },
        };
      },
    },
  };
}
