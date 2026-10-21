import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { loadOwnerStatementPresentation, loadReportCompanyLogo } from "@/features/reports/data/owner-statement-presentation";
import { mapOwnerStatementPublicationPayload } from "@/features/reports/data/owner-statement-report";
import { ownerStatementPublicationPayload } from "@/features/reports/data/owner-statement-report.test-fixture";
import { canonicalizeSignedOwnerOpeningAmount } from "@/features/owner-balances/owner-balance.money";
import type { ScopedFinanceContext } from "@/features/finance-operations/data/scoped-finance-context";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

function fixture() {
  const model = mapOwnerStatementPublicationPayload(structuredClone(ownerStatementPublicationPayload));
  model.lines = [{ ...model.lines[0]!, lineKind: "movement", signedAmount: canonicalizeSignedOwnerOpeningAmount("40.00"),
    sources: [{ ...model.lines[0]!.sources[0]!, sourceType: "tenant_rent_receipt", sourceLineId: "allocation" }] }];
  const finance: ScopedFinanceContext = {
    // The RPC may return multiple authorized properties. Select the frozen IDs.
    properties: [
      { id: "other-property", code: "OTHER", name: "Other property", archived_at: null },
      { id: model.propertyId, code: "PEAK", name: "The PEAK #2807", archived_at: null },
    ],
    units: [
      { id: "other-unit", property_id: "other-property", unit_number: "Other unit", archived_at: null },
      { id: "unit", property_id: model.propertyId, unit_number: "2807", archived_at: null },
    ],
    people: [
      { id: "other-owner", display_name: "Other owner", party_type: "person", archived_at: null },
      { id: model.ownerPersonId, display_name: "XIA YIXUAN", party_type: "person", archived_at: null },
    ],
    leases: [], owner_assignments: [], terms: [], billing_terms: [],
  };
  return { model, finance };
}

// Exercise the real presentation, transaction and Zod context loaders. Only the
// Supabase boundary is mocked: role/branch rejection here is not database proof.
function fakeClient(model: ReturnType<typeof fixture>["model"], finance: unknown, options: {
  rpcError?: string; sourceError?: boolean; logo?: Uint8Array;
} = {}) {
  const logoPath = `${model.organizationId}/logos/00000000-0000-4000-8000-000000000010.jpg`;
  const records: Record<string, Record<string, unknown>> = {
    organizations: { id: model.organizationId, name: "Independent Property Service", logo_storage_path: options.logo ? logoPath : null },
    tenant_invoice_payment_allocations: { id: "allocation", organization_id: model.organizationId, invoice_line_id: "line" },
    tenant_invoice_lines: { id: "line", organization_id: model.organizationId, property_id: model.propertyId, unit_id: "unit", invoice_id: "invoice", customer_label: "Rent" },
    tenant_invoices: { id: "invoice", organization_id: model.organizationId, property_id: model.propertyId, recipient_label: "Tenant" },
  };
  const rpc = vi.fn(async () => ({ data: finance, error: options.rpcError ? { message: options.rpcError } : null }));
  const from = vi.fn((table: string) => {
    if (["properties", "units", "people", "leases"].includes(table)) throw new Error("Raw domain reads are denied to Finance");
    const filters: Record<string, string> = {};
    const result = async () => {
      const row = records[table];
      if (options.sourceError && table !== "organizations") return { data: null, error: { message: "permission denied" } };
      return { data: row && Object.entries(filters).every(([key, value]) => row[key] === value) ? row : null, error: null };
    };
    const query = {
      eq(key: string, value: string) { filters[key] = value; return query; },
      select() { return query; }, single: result, maybeSingle: result,
    };
    return query;
  });
  const download = vi.fn(async () => ({ data: new Blob([new Uint8Array(options.logo ?? [])], { type: "image/jpeg" }), error: null }));
  const storageFrom = vi.fn(() => ({ download }));
  return { client: { rpc, from, storage: { from: storageFrom } } as unknown as SupabaseClient<Database>, rpc, from, storageFrom, download, logoPath };
}

describe("owner statement presentation with finance-scoped reads", () => {
  it("loads exact labels and receipt attribution with raw domain reads denied, preserving frozen figures", async () => {
    const { model, finance } = fixture();
    const before = structuredClone(model);
    const { client, rpc, from, storageFrom } = fakeClient(model, finance);
    expect(await loadOwnerStatementPresentation(client, model)).toEqual({
      logo: undefined, organizationName: "Independent Property Service", ownerName: "XIA YIXUAN",
      propertyLabel: "PEAK / The PEAK #2807", transactionDetails: { 1: { unit: "2807", name: "Tenant", category: "Rent" } },
    });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("get_finance_read_context", {
      p_organization_id: model.organizationId, p_requested_property_id: model.propertyId,
    });
    expect(from.mock.calls.map(([table]) => table)).toEqual([
      "organizations", "tenant_invoice_payment_allocations", "tenant_invoice_lines", "tenant_invoices",
    ]);
    expect(storageFrom).not.toHaveBeenCalled();
    expect(model).toEqual(before);
  });
  it("normalizes the private organization logo through the existing storage path", async () => {
    const { model, finance } = fixture();
    const jpeg = await sharp({ create: { background: { alpha: 1, b: 36, g: 83, r: 20 }, channels: 4, height: 128, width: 256 } }).jpeg().toBuffer();
    const { client, storageFrom, download, logoPath } = fakeClient(model, finance, { logo: jpeg });
    const presentation = await loadOwnerStatementPresentation(client, model);
    expect(presentation.logo?.bytes[0]).toBe(0xff);
    expect(presentation.logo?.bytes[1]).toBe(0xd8);
    expect(presentation.logo?.width).toBeGreaterThan(0);
    expect(presentation.logo?.height).toBeGreaterThan(0);
    expect(storageFrom).toHaveBeenCalledWith("organization-assets");
    expect(download).toHaveBeenCalledWith(logoPath);
    expect((await loadReportCompanyLogo(client, model.organizationId))?.bytes).toEqual(presentation.logo?.bytes);
  });
  it("retains authorized archived labels for historic statements", async () => {
    const { model, finance } = fixture();
    finance.properties[1]!.archived_at = "2026-09-01";
    finance.people[1]!.archived_at = "2026-09-01";
    finance.units[1]!.archived_at = "2026-09-01";
    const result = await loadOwnerStatementPresentation(fakeClient(model, finance).client, model);
    expect(result.propertyLabel).toBe("PEAK / The PEAK #2807");
    expect(result.ownerName).toBe("XIA YIXUAN");
    expect(result.transactionDetails?.[1]?.unit).toBe("2807");
  });
  it.each(["other company", "unassigned property", "other branch", "revoked Finance permission"])(
    "stops before table or storage reads when the finance RPC denies %s", async denial => {
      const { model, finance } = fixture();
      const { client, from, storageFrom } = fakeClient(model, finance, { rpcError: denial });
      await expect(loadOwnerStatementPresentation(client, model)).rejects.toThrow(`Could not load finance read context: ${denial}`);
      expect(from).not.toHaveBeenCalled();
      expect(storageFrom).not.toHaveBeenCalled();
    },
  );
  it.each(["property", "owner", "malformed"])("fails closed on a missing %s context identity", async missing => {
    const { model, finance } = fixture();
    if (missing === "property") finance.properties = [finance.properties[0]!];
    if (missing === "owner") finance.people = [finance.people[0]!];
    const { client, from, storageFrom } = fakeClient(model, missing === "malformed" ? { properties: [] } : finance);
    await expect(loadOwnerStatementPresentation(client, model)).rejects.toThrow(
      missing === "malformed" ? "malformed response" : `Owner Statement ${missing} identity could not be loaded`,
    );
    expect(from).not.toHaveBeenCalled();
    expect(storageFrom).not.toHaveBeenCalled();
  });
  it.each(["missing", "other authorized property"])("rejects a receipt's %s unit", async problem => {
    const { model, finance } = fixture();
    if (problem === "missing") finance.units = [];
    else finance.units[1]!.property_id = "other-property";
    await expect(loadOwnerStatementPresentation(fakeClient(model, finance).client, model)).rejects.toThrow(
      problem === "missing" ? "Statement transaction source is unavailable" : "Statement transaction property mismatch",
    );
  });
  it("propagates denied financial source reads without substituting display data", async () => {
    const { model, finance } = fixture();
    await expect(loadOwnerStatementPresentation(fakeClient(model, finance, { sourceError: true }).client, model))
      .rejects.toThrow("Statement transaction details could not be loaded");
  });

  it("preserves a transparent logo's full canvas and flattens its margins to white", async () => {
    const model = mapOwnerStatementPublicationPayload(structuredClone(ownerStatementPublicationPayload));
    const source = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="240"><rect x="150" y="60" width="300" height="120" fill="#163d48"/></svg>')).png().toBuffer();
    const client = fakeClient({ logo: source, organization: { name: "Company", logo_storage_path: "fixture/logo.png" }, owner: { display_name: "Owner" }, property: { code: "P1", name: "Property" } });
    const presentation = await loadOwnerStatementPresentation(client as unknown as SupabaseClient<Database>, model);
    expect(presentation.logo).toMatchObject({ width: 600, height: 240 });
    const { data, info } = await sharp(presentation.logo!.bytes).raw().toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(3);
    expect([...data.subarray(0, 3)]).toEqual([255, 255, 255]);
    const center = (120 * info.width + 300) * info.channels;
    expect(data[center]).toBeLessThan(40);
    expect(data[center + 1]).toBeLessThan(80);
  });

  it("keeps a company without a logo free of image assets", async () => {
    const model = mapOwnerStatementPublicationPayload(structuredClone(ownerStatementPublicationPayload));
    const client = fakeClient({ logo: new Uint8Array(), organization: { name: "Company", logo_storage_path: null }, owner: { display_name: "Owner" }, property: { code: "P1", name: "Property" } });
    const presentation = await loadOwnerStatementPresentation(client as unknown as SupabaseClient<Database>, model);
    expect(presentation.logo).toBeUndefined();
    expect(presentation.organizationName).toBe("Company");
  });
});
