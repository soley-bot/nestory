import { createHash } from "node:crypto";
import { strFromU8, unzipSync } from "fflate";
import sharp from "sharp";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildOwnerStatementPdf, type OwnerStatementPresentation } from "@/features/reports/data/pdf";
import { buildOwnerStatementXlsx } from "@/features/reports/data/excel";
import { mapOwnerStatementPublicationPayload } from "@/features/reports/data/owner-statement-report";
import { ownerStatementPublicationPayload } from "@/features/reports/data/owner-statement-report.test-fixture";

const mocks = vi.hoisted(() => ({
  client: vi.fn(), stepUp: vi.fn(), loadPresentation: vi.fn(), loadPublication: vi.fn(), revalidate: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/auth/context", () => ({
  requireOwnerStatementPublicationContext: async () => ({
    organizationId: "00000000-0000-0000-0000-000000000001",
    userId: "00000000-0000-0000-0000-000000000101",
  }),
}));
vi.mock("@/lib/auth/privileged-step-up-guard", () => ({ requirePrivilegedStepUp: mocks.stepUp }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: mocks.client }));
vi.mock("@/features/reports/data/owner-statement-presentation", () => ({ loadOwnerStatementPresentation: mocks.loadPresentation }));
vi.mock("@/features/reports/data/owner-statement-report", async importOriginal => ({
  ...await importOriginal<typeof import("@/features/reports/data/owner-statement-report")>(),
  loadOwnerStatementPublication: mocks.loadPublication,
}));

import { publishOwnerStatementAction, resumeOwnerStatementPublicationAction } from "./actions";

describe("Owner Statement publication presentation recovery", () => {
  beforeEach(() => vi.resetAllMocks());

  it.each(["after-freeze", "before-pdf", "after-pdf-upload", "after-pdf-registration", "after-xlsx-upload"])(
    "retains identical branding across replacement and retry interrupted %s", async interruption => {
      const fixture = await setup();
      const original = structuredClone(fixture.presentation);
      const expectedPdf = buildOwnerStatementPdf(fixture.model, original);
      const expectedXlsx = buildOwnerStatementXlsx(fixture.model, original);
      fixture.interrupt = interruption;
      await expect(fixture.publish()).rejects.toThrow();
      expect(fixture.snapshot).not.toBeNull();
      fixture.presentation = { ...original, organizationName: "New company", ownerName: "New owner", propertyLabel: "Renamed property", logo: await logo("red"), transactionDetails: { 2: { unit: "Changed unit", name: "New company", category: "Changed label" } } };
      fixture.interrupt = null;
      await fixture.resume();
      expect(fixture.stored.get("pdf")).toEqual(expectedPdf);
      expect(fixture.stored.get("xlsx")).toEqual(expectedXlsx);
      expect(mocks.loadPresentation).toHaveBeenCalledOnce();
      expect(fixture.model.artifacts.map(item => item.format)).toEqual(["pdf", "xlsx"]);
      expect(fixture.model.artifacts.map(item => item.sha256)).toEqual([hash(expectedPdf), hash(expectedXlsx)]);
      expect(Buffer.from(expectedPdf).includes(Buffer.from(original.logo!.bytes))).toBe(true);
      const workbook = unzipSync(expectedXlsx);
      expect(workbook["xl/media/company-logo.jpg"]).toEqual(original.logo!.bytes);
      expect(strFromU8(workbook["xl/worksheets/sheet1.xml"])).toContain("Original company");
      expect(strFromU8(workbook["xl/worksheets/sheet1.xml"])).not.toContain("Tenant deposits held separately");
    },
  );

  it("recovers after the original company logo and live identities become unavailable", async () => {
    const fixture = await setup();
    fixture.interrupt = "after-pdf-registration";
    await expect(fixture.publish()).rejects.toThrow();
    const pdf = fixture.stored.get("pdf");
    mocks.loadPresentation.mockRejectedValue(new Error("Company logo has been removed"));
    fixture.interrupt = null;
    await fixture.resume();
    expect(fixture.stored.get("pdf")).toEqual(pdf);
    expect(unzipSync(fixture.stored.get("xlsx")!)["xl/media/company-logo.jpg"]).toEqual(fixture.presentation.logo!.bytes);
    expect(mocks.loadPresentation).toHaveBeenCalledOnce();
  });

  it("freezes absence of a logo even when a logo is added before retry", async () => {
    const fixture = await setup();
    fixture.presentation.logo = undefined;
    fixture.interrupt = "before-pdf";
    await expect(fixture.publish()).rejects.toThrow();
    fixture.presentation.logo = await logo("red");
    fixture.interrupt = null;
    await fixture.resume();
    expect(Buffer.from(fixture.stored.get("pdf")!).toString("latin1")).not.toContain("/Subtype /Image");
    expect(unzipSync(fixture.stored.get("xlsx")!)["xl/media/company-logo.jpg"]).toBeUndefined();
  });

  it.each([false, true])("adopts matching legacy artifacts including PR178 compatibility (registered PDF: %s)", async registered => {
    const fixture = await setup();
    const pdf = buildOwnerStatementPdf(fixture.model, fixture.presentation);
    const xlsx = buildOwnerStatementXlsx(fixture.model, fixture.presentation, { includeDepositSummary: true });
    fixture.stored.set("pdf", pdf);
    fixture.stored.set("xlsx", xlsx);
    if (registered) fixture.register("pdf");
    await fixture.resume();
    expect(fixture.stored.get("pdf")).toEqual(pdf);
    expect(fixture.stored.get("xlsx")).toEqual(xlsx);
    expect(fixture.model.artifacts.find(item => item.format === "xlsx")?.sha256).toBe(hash(xlsx));
    expect(fixture.snapshot).not.toBeNull();
  });

  it.each(["pdf", "xlsx"] as const)("blocks changed legacy %s branding before freezing or uploading any missing format", async format => {
    const fixture = await setup();
    fixture.stored.set(format, format === "pdf"
      ? buildOwnerStatementPdf(fixture.model, fixture.presentation)
      : buildOwnerStatementXlsx(fixture.model, fixture.presentation, { includeDepositSummary: true }));
    fixture.register(format);
    fixture.presentation.logo = undefined;
    await expect(fixture.resume()).rejects.toThrow("Restore the original presentation");
    expect(fixture.snapshot).toBeNull();
    expect(fixture.upload).not.toHaveBeenCalled();
    expect(fixture.model.artifacts).toHaveLength(1);
  });

  it("keeps complete older statements independent of live branding and the snapshot service", async () => {
    const fixture = await setup();
    fixture.stored.set("pdf", buildOwnerStatementPdf(fixture.model, fixture.presentation));
    fixture.stored.set("xlsx", buildOwnerStatementXlsx(fixture.model, fixture.presentation, { includeDepositSummary: true }));
    fixture.register("pdf");
    fixture.register("xlsx");
    mocks.loadPresentation.mockRejectedValue(new Error("Live branding unavailable"));
    mocks.stepUp.mockRejectedValue(new Error("No step-up needed"));
    await fixture.publish();
    expect(mocks.stepUp).not.toHaveBeenCalled();
    expect(mocks.loadPresentation).not.toHaveBeenCalled();
    expect(fixture.upload).not.toHaveBeenCalled();
    expect(fixture.snapshot).toBeNull();
  });

  it("uses the first persisted snapshot when concurrent publishers propose different branding", async () => {
    const fixture = await setup();
    const originalPdf = buildOwnerStatementPdf(fixture.model, fixture.presentation);
    fixture.interrupt = "before-pdf";
    await expect(fixture.publish()).rejects.toThrow();
    const winner = fixture.snapshot;
    fixture.snapshot = null;
    fixture.presentation.logo = await logo("red");
    fixture.freezeWinner = winner;
    fixture.interrupt = null;
    await fixture.resume();
    expect(fixture.stored.get("pdf")).toEqual(originalPdf);
  });

  it.each(["get_owner_statement_rendering", "freeze_owner_statement_rendering"])("does not upload after %s fails", async rpc => {
    const fixture = await setup();
    fixture.failedRpc = rpc;
    await expect(fixture.publish()).rejects.toThrow();
    expect(fixture.upload).not.toHaveBeenCalled();
    expect(fixture.snapshot).toBeNull();
  });

  it.each(["unsupported", "corrupt-logo"])("rejects a %s frozen snapshot without falling back to live branding", async invalid => {
    const fixture = await setup();
    fixture.interrupt = "before-pdf";
    await expect(fixture.publish()).rejects.toThrow();
    const snapshot = fixture.snapshot as { rendererVersion: string; presentation: { logo: { base64: string } } };
    if (invalid === "unsupported") snapshot.rendererVersion = "unknown";
    else snapshot.presentation.logo.base64 = "not-a-jpeg";
    fixture.upload.mockClear();
    await expect(fixture.resume()).rejects.toThrow(/invalid|unsupported/);
    expect(mocks.loadPresentation).toHaveBeenCalledOnce();
    expect(fixture.upload).not.toHaveBeenCalled();
  });

  it("fails closed on an ambiguous old artifact read", async () => {
    const fixture = await setup();
    fixture.failedRead = true;
    await expect(fixture.resume()).rejects.toThrow("could not be verified before freezing");
    expect(fixture.snapshot).toBeNull();
    expect(fixture.upload).not.toHaveBeenCalled();
  });

  it.each(["NoSuchKey", "not_found"])("recognizes a missing old object reported as %s", async code => {
    const fixture = await setup();
    fixture.missingObjectCode = code;
    await fixture.publish();
    expect(fixture.model.artifacts).toHaveLength(2);
  });

  it.each(["missing", "hash-mismatch"])("refuses to adopt a legacy registered artifact with %s bytes", async failure => {
    const fixture = await setup();
    fixture.stored.set("pdf", buildOwnerStatementPdf(fixture.model, fixture.presentation));
    fixture.register("pdf");
    if (failure === "missing") fixture.stored.delete("pdf");
    else fixture.model.artifacts[0].sha256 = "0".repeat(64);
    await expect(fixture.resume()).rejects.toThrow(/could not be verified|integrity verification failed/);
    expect(fixture.snapshot).toBeNull();
    expect(fixture.upload).not.toHaveBeenCalled();
  });
});

async function setup() {
  const model = mapOwnerStatementPublicationPayload({
    ...structuredClone(ownerStatementPublicationPayload),
    components: ownerStatementPublicationPayload.components.map(component => component.component === "ips_held_owner_cash"
      ? { ...component, movement_amount: "-100.00", closing_amount: "1150.00" } : component),
    lines: [ownerStatementPublicationPayload.lines[0], {
      ...ownerStatementPublicationPayload.lines[0], line_number: 2, line_kind: "movement", signed_amount: "-100.00",
    }, { ...ownerStatementPublicationPayload.lines[1], line_number: 3, signed_amount: "1150.00" }],
  });
  const fixture = {
    model,
    presentation: {
      organizationName: "Original company", ownerName: "Original owner", propertyLabel: "Original property",
      transactionDetails: { 2: { unit: "101", name: "Original company", category: "Management Fees" } },
      logo: await logo("blue"),
    } as OwnerStatementPresentation,
    snapshot: null as unknown,
    freezeWinner: null as unknown,
    failedRpc: null as string | null,
    failedRead: false,
    missingObjectCode: "404",
    interrupt: null as string | null,
    stored: new Map<string, Uint8Array>(),
    upload: vi.fn(),
    register(format: "pdf" | "xlsx") {
      if (model.artifacts.some(item => item.format === format)) return;
      const bytes = fixture.stored.get(format)!;
      model.artifacts.push({ format, sha256: hash(bytes), sizeBytes: bytes.byteLength,
        storagePath: path(format), id: `${format}-artifact`, createdAt: model.generatedAt, createdBy: model.generatedBy });
    },
    publish: () => publishOwnerStatementAction(form({ revisionId: model.revisionId, idempotencyKey: "branding-publication" })),
    resume: () => resumeOwnerStatementPublicationAction(form({ publicationId: model.publicationId, idempotencyKey: "branding-resume-new-key" })),
  };
  const path = (format: string) => `${model.organizationId}/${model.publicationId}/${format}/owner-statement-${model.statementNumber}.${format}`;
  const formatOf = (path: string) => path.endsWith(".pdf") ? "pdf" : "xlsx";
  const bucket = {
    download: vi.fn(async (path: string) => {
      const bytes = fixture.stored.get(formatOf(path));
      return fixture.failedRead ? { data: null, error: { statusCode: "503" } }
        : bytes ? { data: new Blob([new Uint8Array(bytes)]), error: null }
          : { data: null, error: { statusCode: fixture.missingObjectCode } };
    }),
    upload: fixture.upload.mockImplementation(async (path: string, bytes: Uint8Array, options: { upsert: boolean }) => {
      expect(fixture.snapshot).not.toBeNull();
      expect(options.upsert).toBe(false);
      const format = formatOf(path);
      if (fixture.interrupt === "before-pdf" || (fixture.interrupt === "after-pdf-registration" && format === "xlsx")) {
        return { error: { message: "Interrupted upload" } };
      }
      if (fixture.stored.has(format)) return { error: { statusCode: "409" } };
      fixture.stored.set(format, bytes);
      return { error: null };
    }),
  };
  mocks.client.mockResolvedValue({
    rpc: async () => ({ data: { publication_id: model.publicationId, statement_number: model.statementNumber }, error: null }),
    storage: { from: () => bucket },
  });
  mocks.stepUp.mockResolvedValue({
    storage: { from: () => bucket },
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (fixture.failedRpc === name) return { data: null, error: { message: "Interrupted snapshot request" } };
      if (name === "get_owner_statement_rendering") return { data: structuredClone(fixture.snapshot), error: null };
      if (name === "freeze_owner_statement_rendering") {
        fixture.snapshot ??= structuredClone(fixture.freezeWinner ?? args.p_snapshot);
        if (fixture.interrupt === "after-freeze") return { data: null, error: { message: "Interrupted snapshot response" } };
        return { data: structuredClone(fixture.snapshot), error: null };
      }
      const format = args.p_format as "pdf" | "xlsx";
      if (name === "get_owner_statement_artifact_object") return { data: {
        content_type: format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        metadata_size_bytes: fixture.stored.get(format)!.byteLength,
        storage_object_id: `${format}-object`, storage_object_version: "version-1",
      }, error: null };
      if (name === "register_owner_statement_artifact_verified") {
        if (fixture.interrupt === `after-${format}-upload`) return { error: { message: "Interrupted registration" } };
        expect(args.p_sha256).toBe(hash(fixture.stored.get(format)!));
        fixture.register(format);
        return { data: {}, error: null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
  });
  mocks.loadPublication.mockImplementation(async () => structuredClone(model));
  mocks.loadPresentation.mockImplementation(async () => structuredClone(fixture.presentation));
  return fixture;
}

async function logo(background: string) {
  const bytes = await sharp({ create: { background, width: 40, height: 20, channels: 3 } }).jpeg().toBuffer();
  return { bytes: new Uint8Array(bytes), width: 40, height: 20 };
}

function hash(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}
