export type CommercialIssuerSnapshot = {
  contactEmail?: string | null;
  contactPhone?: string | null;
  logo?: { bytes: Uint8Array; height: number; width: number };
  name: string;
};

export type TenantInvoicePdfModel = {
  billingPeriodEnd: string;
  billingPeriodStart: string;
  currency: "USD" | "KHR";
  dueDate: string;
  invoiceNumber: string;
  issueDate: string;
  issuer: CommercialIssuerSnapshot;
  lines: Array<{ amount: string; description: string | null; label: string }>;
  note: string | null;
  occupantLabels: string[];
  paymentInstructions: string;
  propertyLabel: string;
  recipientLabel: string;
  totalAmount: string;
  unitLabel: string | null;
  voided: boolean;
};

export type TenantReceiptPdfModel = {
  allocations: Array<{ amount: string; label: string }>;
  amountPreviouslyPaid: string;
  currency: "USD" | "KHR";
  invoiceNumber: string;
  invoiceTotal: string;
  issuer: CommercialIssuerSnapshot;
  paymentAmount: string;
  paymentDate: string;
  paymentReference: string | null;
  publicationDate: string;
  propertyLabel: string;
  receiptNumber: string;
  recipientLabel: string;
  remainingBalance: string;
  reversed: boolean;
  unitLabel: string | null;
};
