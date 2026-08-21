import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import ts from "typescript";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
registerHooks({
  load(url, context, nextLoad) {
    if (!url.endsWith(".ts")) return nextLoad(url, context);
    return {
      format: "module",
      shortCircuit: true,
      source: ts.transpileModule(readFileSync(fileURLToPath(url), "utf8"), {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
        },
      }).outputText,
    };
  },
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith("@/")) return nextResolve(specifier, context);
    const absolutePath = path.join(repositoryRoot, "src", specifier.slice(2));
    const resolvedPath = existsSync(absolutePath) ? absolutePath : `${absolutePath}.ts`;
    return { shortCircuit: true, url: pathToFileURL(resolvedPath).href };
  },
});

const { buildTenantInvoicePdf } = await import(
  "../src/features/finance-operations/documents/invoice-pdf.ts"
);
const { buildTenantReceiptPdf } = await import(
  "../src/features/finance-operations/documents/receipt-pdf.ts"
);

const outputDirectory = path.join(
  repositoryRoot,
  "tmp",
  "pdfs",
  "tenant-commercial-documents",
);
const popplerDirectory = path.join(
  process.env.USERPROFILE ?? "",
  ".cache",
  "codex-runtimes",
  "codex-primary-runtime",
  "dependencies",
  "native",
  "poppler",
  "Library",
  "bin",
);
const pdfinfo = path.join(popplerDirectory, "pdfinfo.exe");
const pdftoppm = path.join(popplerDirectory, "pdftoppm.exe");

const issuer = {
  contactEmail: "billing@ips.example",
  contactPhone: "+855 12 345 678",
  name: "Independent Property Service",
};

const fixtures = [
  {
    build: buildTenantInvoicePdf,
    documentNumber: "INV-QA-ONE-0001",
    expectedPages: 1,
    expectedText: ["Monthly rent - August 2026 rent", "TOTAL DUE"],
    filename: "invoice-one-page",
    kind: "invoice",
    model: invoiceModel({ invoiceNumber: "INV-QA-ONE-0001" }),
    total: "USD 1,250.00",
  },
  {
    build: buildTenantInvoicePdf,
    documentNumber: "INV-QA-MULTI-0002",
    expectedPages: 6,
    expectedText: ["Service line 58", "TOTAL DUE"],
    filename: "invoice-multi-page",
    kind: "invoice",
    model: invoiceModel({
      invoiceNumber: "INV-QA-MULTI-0002",
      lines: Array.from({ length: 58 }, (_, index) => ({
        amount: `${index + 1}.00`,
        description:
          `Operational charge ${index + 1} with a deliberately long customer-facing explanation ` +
          "that must wrap cleanly without crossing the amount column or the page footer.",
        label: `Service line ${index + 1}`,
      })),
      totalAmount: "1711.00",
    }),
    total: "USD 1,711.00",
  },
  {
    build: buildTenantInvoicePdf,
    documentNumber: "INV-QA-LONG-0003",
    expectedPages: 3,
    expectedText: ["LONG-TEXT-START", "LONG-TEXT-END", "TOTAL DUE"],
    filename: "invoice-long-text",
    kind: "invoice",
    model: invoiceModel({
      invoiceNumber: "INV-QA-LONG-0003",
      lines: [
        {
          amount: "1250.00",
          description: [
            "LONG-TEXT-START",
            ...Array.from({ length: 750 }, (_, index) => `detail-${index + 1}`),
            "LONG-TEXT-END",
          ].join(" "),
          label: "Rent detail",
        },
      ],
      note:
        "Retain this invoice with the lease record and quote the invoice number on every payment reference.",
      paymentInstructions:
        "Pay by bank transfer to the IPS operating account. Include the full invoice number and tenant name in the transfer reference.",
    }),
    total: "USD 1,250.00",
  },
  {
    build: buildTenantReceiptPdf,
    documentNumber: "RCT-QA-FIRST-0001",
    expectedPages: 1,
    expectedText: [
      "USD 1,250.00",
      "USD 0.00",
      "USD 350.00",
      "USD 900.00",
    ],
    filename: "receipt-first-partial-payment",
    kind: "receipt",
    model: receiptModel({
      amountPreviouslyPaid: "0.00",
      paymentAmount: "350.00",
      receiptNumber: "RCT-QA-FIRST-0001",
      remainingBalance: "900.00",
    }),
    total: "USD 350.00",
  },
  {
    build: buildTenantReceiptPdf,
    documentNumber: "RCT-QA-SEQUENTIAL-0002",
    expectedPages: 1,
    expectedText: [
      "USD 1,250.00",
      "USD 350.00",
      "USD 400.00",
      "USD 500.00",
    ],
    filename: "receipt-sequential-partial-payment",
    kind: "receipt",
    model: receiptModel({
      allocations: [{ amount: "400.00", label: "August 2026 rent" }],
      amountPreviouslyPaid: "350.00",
      paymentAmount: "400.00",
      paymentReference: "BANK-SEQUENTIAL-0002",
      receiptNumber: "RCT-QA-SEQUENTIAL-0002",
      remainingBalance: "500.00",
    }),
    total: "USD 400.00",
  },
  {
    build: buildTenantReceiptPdf,
    documentNumber: "RCT-QA-FINAL-0003",
    expectedPages: 1,
    expectedText: [
      "USD 1,250.00",
      "USD 750.00",
      "USD 500.00",
      "USD 0.00",
    ],
    filename: "receipt-final-payment",
    kind: "receipt",
    model: receiptModel({
      allocations: [{ amount: "500.00", label: "August 2026 rent" }],
      amountPreviouslyPaid: "750.00",
      paymentAmount: "500.00",
      paymentReference: "BANK-FINAL-0003",
      receiptNumber: "RCT-QA-FINAL-0003",
      remainingBalance: "0.00",
    }),
    total: "USD 500.00",
  },
];

await rm(outputDirectory, { force: true, recursive: true });
await mkdir(outputDirectory, { recursive: true });

test("renders deterministic A4 tenant commercial document fixtures with Poppler", async (t) => {
  assert.ok(process.env.USERPROFILE, "USERPROFILE is required to locate the bundled Poppler runtime");
  assert.doesNotThrow(() => execFileSync(pdfinfo, ["-v"], { stdio: "pipe" }));
  assert.doesNotThrow(() => execFileSync(pdftoppm, ["-v"], { stdio: "pipe" }));

  for (const fixture of fixtures) {
    await t.test(fixture.filename, async () => {
      const first = Buffer.from(fixture.build(fixture.model));
      const second = Buffer.from(fixture.build(fixture.model));
      const firstHash = sha256(first);
      const secondHash = sha256(second);

      assert.deepEqual(first, second, "identical models must render identical bytes");
      assert.equal(firstHash, secondHash, "identical models must have a stable SHA-256");
      assert.match(firstHash, /^[0-9a-f]{64}$/);
      assert.equal(first.subarray(0, 8).toString("latin1"), "%PDF-1.4");

      const pdfPath = path.join(outputDirectory, `${fixture.filename}.pdf`);
      const pngPrefix = path.join(outputDirectory, `${fixture.filename}-page`);
      await writeFile(pdfPath, first);

      const info = execFileSync(pdfinfo, [pdfPath], { encoding: "utf8" });
      assert.equal(readPdfInfoInteger(info, "Pages"), fixture.expectedPages);
      assert.match(info, /^Page size:\s+595 x 842 pts \(A4\)$/m);

      const rawText = first.toString("latin1");
      assert.ok(rawText.includes(fixture.documentNumber));
      assert.ok(rawText.includes(fixture.total));
      fixture.expectedText.forEach((value) => assert.ok(rawText.includes(value)));
      assert.equal(
        occurrences(rawText, fixture.documentNumber),
        fixture.expectedPages,
        "the document number must repeat on every page",
      );
      for (let page = 1; page <= fixture.expectedPages; page += 1) {
        assert.ok(rawText.includes(`Page ${page} of ${fixture.expectedPages}`));
      }
      if (fixture.expectedPages > 1) {
        const tableHeader = fixture.kind === "invoice" ? "DESCRIPTION" : "PAYMENT ALLOCATION";
        assert.equal(occurrences(rawText, tableHeader), fixture.expectedPages);
        assert.equal(occurrences(rawText, "CONTINUED"), fixture.expectedPages - 1);
      }

      execFileSync(
        pdftoppm,
        ["-png", "-r", "144", pdfPath, pngPrefix],
        { stdio: "pipe" },
      );
      const pageFiles = (await readdir(outputDirectory))
        .filter((name) => name.startsWith(`${fixture.filename}-page-`) && name.endsWith(".png"))
        .sort(numericPageSort);
      assert.equal(pageFiles.length, fixture.expectedPages);
      for (const pageFile of pageFiles) {
        const pagePath = path.join(outputDirectory, pageFile);
        const metadata = await stat(pagePath);
        assert.ok(metadata.size > 1_000, `${pageFile} must be a non-empty rendered page`);
      }

      t.diagnostic(
        JSON.stringify({
          documentNumber: fixture.documentNumber,
          pages: fixture.expectedPages,
          pngs: pageFiles.length,
          sha256: firstHash,
        }),
      );
    });
  }
});

function invoiceModel(overrides = {}) {
  return {
    billingPeriodEnd: "2026-08-31",
    billingPeriodStart: "2026-08-01",
    currency: "USD",
    dueDate: "2026-08-10",
    invoiceNumber: "INV-QA-0001",
    issueDate: "2026-08-05",
    issuer,
    lines: [
      { amount: "1200.00", description: "August 2026 rent", label: "Monthly rent" },
      { amount: "50.00", description: null, label: "Parking" },
    ],
    note: "Please include the invoice number with payment.",
    occupantLabels: ["Maly Chan", "Dara Chan"],
    paymentInstructions: "Pay by bank transfer to IPS operating account 001-9182.",
    propertyLabel: "The Peak Residence",
    recipientLabel: "Sokha Chan",
    totalAmount: "1250.00",
    unitLabel: "Unit 2807",
    voided: false,
    ...overrides,
  };
}

function receiptModel(overrides = {}) {
  return {
    allocations: [
      { amount: "300.00", label: "August 2026 rent" },
      { amount: "50.00", label: "Parking" },
    ],
    amountPreviouslyPaid: "0.00",
    currency: "USD",
    invoiceNumber: "INV-QA-ONE-0001",
    invoiceTotal: "1250.00",
    issuer,
    paymentAmount: "350.00",
    paymentDate: "2026-08-08",
    paymentReference: "BANK-FIRST-0001",
    propertyLabel: "The Peak Residence",
    publicationDate: "2026-08-09",
    receiptNumber: "RCT-QA-0001",
    recipientLabel: "Sokha Chan",
    remainingBalance: "900.00",
    reversed: false,
    unitLabel: "Unit 2807",
    ...overrides,
  };
}

function readPdfInfoInteger(info, label) {
  const value = new RegExp(`^${label}:\\s+(\\d+)$`, "m").exec(info)?.[1];
  assert.ok(value, `pdfinfo did not report ${label}`);
  return Number(value);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function occurrences(value, needle) {
  return value.split(needle).length - 1;
}

function numericPageSort(left, right) {
  return Number(left.match(/-(\d+)\.png$/)?.[1]) - Number(right.match(/-(\d+)\.png$/)?.[1]);
}
