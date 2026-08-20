import sharp from "sharp";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type {
  CommercialIssuerSnapshot,
  TenantInvoicePdfModel,
  TenantReceiptPdfModel,
} from "@/features/finance-operations/documents/commercial-document.types";

export type InvoicePublicationInput = {
  contactEmail: string;
  contactPhone: string;
  note: string | null;
  paymentInstructions: string;
};

export async function loadTenantInvoicePdfModel(
  client: SupabaseClient<Database>,
  organizationId: string,
  invoiceId: string,
  publicationInput: InvoicePublicationInput,
): Promise<TenantInvoicePdfModel> {
  const source = await loadSource(client, organizationId, "invoice", invoiceId);
  if (source.source_state === "voided") {
    throw new Error("Voided tenant invoices cannot be published.");
  }
  requireSourceIdentity(source, organizationId, "invoice", invoiceId);

  const invoice = record(source.invoice, "Invalid tenant Invoice source.");
  if (requiredString(invoice.lifecycle) === "void") {
    throw new Error("Voided tenant invoices cannot be published.");
  }
  const { issuer } = await loadIssuer(
    client,
    organizationId,
    publicationInput,
  );
  const occupantLabels = await loadInvoiceOccupantLabels(
    client,
    organizationId,
    invoiceId,
  );
  const property = record(source.property, "Invalid tenant Invoice source.");
  const recipient = record(source.recipient, "Invalid tenant Invoice source.");
  const lines = array(source.lines, "Invalid tenant Invoice source.").map(
    (value) => {
      const line = record(value, "Invalid tenant Invoice line.");
      return {
        amount: moneyString(line.amount),
        description: nullableString(line.description),
        label: requiredString(line.label),
      };
    },
  );

  return {
    billingPeriodEnd: requiredString(invoice.billing_period_end),
    billingPeriodStart: requiredString(invoice.billing_period_start),
    currency: currency(invoice.currency),
    dueDate: requiredString(invoice.due_date),
    invoiceNumber: requiredString(source.document_number),
    issueDate: requiredString(invoice.issue_date),
    issuer,
    lines,
    note: publicationInput.note,
    occupantLabels,
    paymentInstructions: publicationInput.paymentInstructions,
    propertyLabel: propertyLabel(property),
    recipientLabel: requiredString(recipient.label),
    totalAmount: moneyString(invoice.total_amount),
    unitLabel: unitLabel(property.unit_number),
    voided: false,
  };
}

export async function loadTenantReceiptPdfModel(
  client: SupabaseClient<Database>,
  organizationId: string,
  paymentId: string,
): Promise<TenantReceiptPdfModel> {
  const source = await loadSource(client, organizationId, "receipt", paymentId);
  requireSourceIdentity(source, organizationId, "receipt", paymentId);

  const payment = record(source.payment, "Invalid tenant Receipt source.");
  if (
    source.source_state === "reversal" ||
    payment.reversal_of_id !== null
  ) {
    throw new Error(
      "Reversal payments cannot be published as tenant receipts.",
    );
  }

  const invoice = record(source.invoice, "Invalid tenant Receipt source.");
  const property = record(source.property, "Invalid tenant Receipt source.");
  const recipient = record(source.recipient, "Invalid tenant Receipt source.");
  const { issuer, operationalTimezone } = await loadIssuer(
    client,
    organizationId,
  );
  const allocations = array(
    source.allocations,
    "Invalid tenant Receipt source.",
  ).map((value) => {
    const allocation = record(value, "Invalid tenant Receipt allocation.");
    const label = requiredString(allocation.label);
    const description = nullableString(allocation.description);
    return {
      amount: moneyString(allocation.amount),
      label: description ? `${label} - ${description}` : label,
    };
  });

  return {
    allocations,
    amountPreviouslyPaid: moneyString(payment.amount_previously_paid),
    currency: currency(invoice.currency),
    invoiceNumber: requiredString(invoice.invoice_number),
    invoiceTotal: moneyString(invoice.total_amount),
    issuer,
    paymentAmount: moneyString(payment.amount),
    paymentDate: requiredString(payment.received_date),
    paymentReference: nullableString(payment.reference),
    propertyLabel: propertyLabel(property),
    publicationDate: dateInTimeZone(new Date(), operationalTimezone),
    receiptNumber: requiredString(source.document_number),
    recipientLabel: requiredString(recipient.label),
    remainingBalance: moneyString(payment.remaining_balance),
    reversed: source.source_state === "reversed",
    unitLabel: unitLabel(property.unit_number),
  };
}

async function loadSource(
  client: SupabaseClient<Database>,
  organizationId: string,
  sourceKind: "invoice" | "receipt",
  sourceId: string,
) {
  const result = await client.rpc(
    "get_tenant_commercial_document_publication_source",
    {
      p_organization_id: organizationId,
      p_source_id: sourceId,
      p_source_kind: sourceKind,
    },
  );
  if (result.error) {
    throw new Error(
      sourceKind === "invoice"
        ? "Tenant Invoice source is unavailable."
        : "Tenant Receipt source is unavailable.",
    );
  }
  return record(
    result.data,
    sourceKind === "invoice"
      ? "Invalid tenant Invoice source."
      : "Invalid tenant Receipt source.",
  );
}

function requireSourceIdentity(
  source: Record<string, unknown>,
  organizationId: string,
  sourceKind: "invoice" | "receipt",
  sourceId: string,
) {
  const issuer = record(source.issuer, "Invalid commercial document issuer.");
  if (
    source.source_kind !== sourceKind ||
    source.source_id !== sourceId ||
    issuer.organization_id !== organizationId
  ) {
    throw new Error(
      sourceKind === "invoice"
        ? "Tenant Invoice source is unavailable."
        : "Tenant Receipt source is unavailable.",
    );
  }
}

async function loadIssuer(
  client: SupabaseClient<Database>,
  organizationId: string,
  publicationInput?: InvoicePublicationInput,
): Promise<{
  issuer: CommercialIssuerSnapshot;
  operationalTimezone: string;
}> {
  const organization = await client
    .from("organizations")
    .select("name, logo_storage_path, operational_timezone")
    .eq("id", organizationId)
    .single();
  if (organization.error || !organization.data) {
    throw new Error("Commercial document issuer is unavailable.");
  }

  const issuer: CommercialIssuerSnapshot = {
    ...(publicationInput
      ? {
          contactEmail: publicationInput.contactEmail,
          contactPhone: publicationInput.contactPhone,
        }
      : {}),
    name: organization.data.name,
  };
  const operationalTimezone = requiredString(
    organization.data.operational_timezone,
  );
  if (!organization.data.logo_storage_path) {
    return { issuer, operationalTimezone };
  }

  const logo = await loadPdfLogo(client, organization.data.logo_storage_path);
  return {
    issuer: logo ? { ...issuer, logo } : issuer,
    operationalTimezone,
  };
}

async function loadInvoiceOccupantLabels(
  client: SupabaseClient<Database>,
  organizationId: string,
  invoiceId: string,
) {
  const invoice = await client
    .from("tenant_invoices")
    .select("occupant_labels")
    .eq("organization_id", organizationId)
    .eq("id", invoiceId)
    .single();
  if (invoice.error || !invoice.data) {
    throw new Error("Tenant Invoice source is unavailable.");
  }
  return stringArray(invoice.data.occupant_labels);
}

function dateInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const part = (type: "day" | "month" | "year") => {
    const value = parts.find((candidate) => candidate.type === type)?.value;
    return requiredString(value);
  };
  return `${part("year")}-${part("month")}-${part("day")}`;
}

async function loadPdfLogo(
  client: SupabaseClient<Database>,
  storagePath: string,
) {
  try {
    const download = await client.storage
      .from("organization-assets")
      .download(storagePath);
    if (download.error || !download.data) return undefined;
    const source = Buffer.from(await download.data.arrayBuffer());
    const normalized = await sharp(source)
      .rotate()
      .resize({
        fit: "inside",
        height: 240,
        width: 600,
        withoutEnlargement: true,
      })
      .flatten({ background: "#ffffff" })
      .jpeg({ chromaSubsampling: "4:4:4", progressive: false, quality: 90 })
      .toBuffer({ resolveWithObject: true });
    if (normalized.info.width < 1 || normalized.info.height < 1) return undefined;
    return {
      bytes: new Uint8Array(
        normalized.data.buffer,
        normalized.data.byteOffset,
        normalized.data.byteLength,
      ),
      height: normalized.info.height,
      width: normalized.info.width,
    };
  } catch {
    return undefined;
  }
}

function propertyLabel(property: Record<string, unknown>) {
  return [nullableString(property.code), requiredString(property.name)]
    .filter((value): value is string => Boolean(value))
    .join(" / ");
}

function unitLabel(value: unknown) {
  const number = nullableString(value);
  return number ? `Unit ${number}` : null;
}

function currency(value: unknown): "USD" | "KHR" {
  if (value !== "USD" && value !== "KHR") {
    throw new Error("Unsupported commercial document currency.");
  }
  return value;
}

function moneyString(value: unknown) {
  if (typeof value !== "string" || !/^-?(?:0|[1-9]\d*)\.\d{2}$/.test(value)) {
    throw new Error("Commercial document money must be an exact decimal string.");
  }
  return value;
}

function requiredString(value: unknown) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error("Invalid commercial document text.");
  }
  return value;
}

function nullableString(value: unknown) {
  return value === null || value === undefined ? null : requiredString(value);
}

function array(value: unknown, message: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(message);
  return value;
}

function stringArray(value: unknown) {
  return array(value, "Invalid tenant Invoice occupant labels.").map(
    requiredString,
  );
}

function record(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
  return value as Record<string, unknown>;
}
