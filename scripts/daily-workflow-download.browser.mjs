// A small real-browser transport regression, not a Supabase integration test.
// Auth/Storage boundaries are synthetic; proxy, cookie policy, receipt route and
// PDF renderer are the application implementations. No DB or hosted URL is used.
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { once } from "node:events";
import { chromium } from "playwright";
import { strToU8, zipSync } from "fflate";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { getAuthCookieOptions } from "@/lib/auth/tenant";
import { GET as receiptGET } from "@/app/api/finance/documents/[artifactId]/route";
import { buildTenantReceiptPdf } from "@/features/finance-operations/documents/receipt-pdf";
import { isContainedPdf } from "@/lib/uploads/pdf-containment";
import { downloadDailyArtifact } from "./daily-workflow-download.mjs";

const synthetic = vi.hoisted(() => ({
  cookie: "synthetic-transport-session",
  value: "synthetic-local-only",
  user: "00000000-0000-4000-8000-000000000701",
  organization: "00000000-0000-4000-8000-000000000001",
  download: vi.fn(),
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url, _key, options) => ({ auth: { getClaims: async () => ({
    data: options.cookies.getAll().some(({ name, value }) => name === synthetic.cookie && value === synthetic.value)
      ? { claims: { sub: synthetic.user } } : null,
    error: null,
  }) } }),
}));
vi.mock("@/lib/db/env", () => ({ getSupabaseEnv: () => ({ supabaseUrl: "http://127.0.0.1", supabaseKey: "synthetic-unused" }) }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: async () => ({}) }));
vi.mock("@/lib/auth/context", () => ({
  getCurrentUser: async () => ({ id: synthetic.user }),
  getWorkspaceMembershipForUser: async () => ({ organizationId: synthetic.organization, permissionKeys: new Set(["finance.view"]) }),
}));
vi.mock("@/features/finance-operations/documents/commercial-document-artifacts", () => ({ downloadTenantCommercialDocumentArtifact: synthetic.download }));

const id = "a1111111-1111-4111-8111-111111111111";
const receiptPath = `/api/finance/documents/${id}`;
const secretMarker = "synthetic-secret-must-not-be-reported";
const mime = { pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
const pdf = Buffer.from(buildTenantReceiptPdf({
  allocations: [{ amount: "40.00", label: "October 2026 rent" }],
  amountPreviouslyPaid: "0.00", currency: "USD", invoiceNumber: "INV-SYNTHETIC",
  invoiceTotal: "120.00", issuer: { name: "Synthetic Transport Test" },
  paymentAmount: "40.00", paymentDate: "2026-10-06", publicationDate: "2026-10-06",
  propertyLabel: "Synthetic Property", receiptNumber: "RCT-SYNTHETIC",
  recipientLabel: "Synthetic Tenant", remainingBalance: "80.00", reversed: false, unitLabel: "Unit Test",
}));
const xlsx = Buffer.from(zipSync({
  "[Content_Types].xml": strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'),
  "_rels/.rels": strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
  "xl/workbook.xml": strToU8('<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Synthetic" sheetId="1" r:id="rId1"/></sheets></workbook>'),
  "xl/_rels/workbook.xml.rels": strToU8('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
  "xl/worksheets/sheet1.xml": strToU8('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>'),
}));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const metadata = (bytes = pdf, format = "pdf") => ({ id, size_bytes: bytes.length, sha256: digest(bytes), format });
const attachment = (bytes = pdf, format = "pdf", changes = {}) => new Response(bytes, { headers: {
  "content-type": mime[format], "content-disposition": `attachment; filename="synthetic.${format}"`,
  "content-length": String(bytes.length), ...changes,
} });
let server, browser, context, page, base, override;
const requests = [];
const serverErrors = [];
const blockedDestinations = [];

describe.sequential("authenticated daily artifact transport", () => {
  beforeAll(async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_ROOT_DOMAIN", "");
    vi.stubEnv("NEXT_PUBLIC_NESTORY_SENTRY_DSN", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1");
    const channel = process.env.NESTORY_LOCAL_BROWSER_CHANNEL;
    if (channel && (process.env.CI || !["chrome", "msedge"].includes(channel))) {
      throw new Error("Local browser override is restricted to an explicit installed browser outside CI");
    }
    synthetic.download.mockResolvedValue({ bytes: pdf, contentType: mime.pdf, filename: "synthetic.pdf", sourceState: "current" });
    server = createServer(async (incoming, outgoing) => {
      try {
        const request = new NextRequest(new URL(incoming.url, base), { headers: incoming.headers });
        requests.push({ path: request.nextUrl.pathname, hasCookie: request.cookies.has(synthetic.cookie) });
        const gate = await proxy(request);
        let response = gate;
        if (gate.headers.get("x-middleware-next") === "1") {
          if (request.nextUrl.pathname === "/workspace") {
            response = new Response("<!doctype html><title>Synthetic transport</title>", { headers: { "content-type": "text/html" } });
          } else if (override === "hang") {
            outgoing.writeHead(200, { "content-type": mime.pdf, "content-disposition": "attachment" });
            outgoing.flushHeaders();
            return;
          } else if (override) {
            response = override();
          } else if (request.nextUrl.pathname === receiptPath) {
            response = await receiptGET(request, { params: Promise.resolve({ artifactId: id }) });
          } else if (request.nextUrl.pathname === "/api/reports/pdf") {
            response = attachment();
          } else if (request.nextUrl.pathname === "/api/reports/excel") {
            response = attachment(xlsx, "xlsx");
          } else {
            response = new Response("Synthetic endpoint", { status: 404 });
          }
        }
        for (const [name, value] of gate.headers) if (!name.startsWith("x-middleware-")) outgoing.setHeader(name, value);
        for (const [name, value] of response.headers) if (!name.startsWith("x-middleware-")) outgoing.setHeader(name, value);
        outgoing.writeHead(response.status);
        outgoing.end(Buffer.from(await response.arrayBuffer()));
      } catch {
        serverErrors.push("unexpected synthetic server failure");
        outgoing.writeHead(500); outgoing.end();
      }
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    base = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
    console.log(JSON.stringify({ browser: browser.version(), channel: channel ?? "pinned-chromium", playwright: createRequire(import.meta.url)("playwright/package.json").version }));
  });
  beforeEach(async () => {
    override = undefined; requests.length = 0; serverErrors.length = 0; blockedDestinations.length = 0;
    synthetic.download.mockClear();
    context = await browser.newContext();
    await context.route("**/*", (route) => {
      if (new URL(route.request().url()).origin === base) return route.continue();
      blockedDestinations.push("blocked non-app origin");
      return route.abort();
    });
    const options = getAuthCookieOptions();
    expect(options).toMatchObject({ secure: true, httpOnly: true, sameSite: "lax", path: "/" });
    await context.addCookies([{ ...options, name: synthetic.cookie, value: synthetic.value, domain: "127.0.0.1", sameSite: "Lax" }]);
    page = await context.newPage();
    expect((await page.goto(`${base}/workspace`)).status()).toBe(200);
  });
  afterEach(async () => {
    await context?.close();
    expect(serverErrors).toEqual([]);
    expect(blockedDestinations).toEqual([]);
  });
  afterAll(async () => {
    await browser?.close();
    if (server?.listening) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
    vi.unstubAllEnvs();
  });

  it("reproduces APIRequestContext's 307 login redirect and verifies real receipt PDF bytes using the browser session", async () => {
    expect(requests[0]).toEqual({ path: "/workspace", hasCookie: true });
    const old = await page.request.get(`${base}${receiptPath}`, { maxRedirects: 0 });
    expect(old.status()).toBe(307);
    const destination = new URL(old.headers().location);
    // Installed NextURL normalizes loopback IPs to localhost before the proxy
    // constructs its login redirect. This is a login response, not Storage.
    expect(destination.origin).toBe(base.replace("127.0.0.1", "localhost"));
    expect(destination.pathname).toBe("/login");
    expect(destination.search).toBe("");
    expect(requests.at(-1)).toEqual({ path: receiptPath, hasCookie: false });
    expect(synthetic.download).not.toHaveBeenCalled();
    await old.dispose();
    expect(isContainedPdf(pdf)).toBe(true);
    for (const content of ["PAYMENT RECEIPT", "RCT-SYNTHETIC", "INV-SYNTHETIC", "USD 40.00", "USD 80.00"]) expect(pdf.toString("latin1")).toContain(content);
    expect(await downloadDailyArtifact(page, base, receiptPath, metadata())).toBe(digest(pdf));
    expect(requests.at(-1)).toEqual({ path: receiptPath, hasCookie: true });
    expect(synthetic.download).toHaveBeenCalledOnce();
    expect(synthetic.download).toHaveBeenCalledWith({}, synthetic.organization, id);
    console.log(JSON.stringify({ reproduction: "local-only", previousStatus: 307, redirectHost: destination.hostname, redirectPath: "/login", previousRequestHadCookie: false, browserRequestHadCookie: true, receiptPdfVerified: true, receiptBytes: pdf.length, receiptSha256: digest(pdf) }));
  });

  it("keeps retained receipt bytes identical and verifies both owner document formats", async () => {
    for (let i = 0; i < 2; i++) expect(await downloadDailyArtifact(page, base, receiptPath, metadata())).toBe(digest(pdf));
    expect(await downloadDailyArtifact(page, base, `/api/reports/pdf?artifactId=${id}`, metadata())).toBe(digest(pdf));
    expect(await downloadDailyArtifact(page, base, `/api/reports/excel?artifactId=${id}`, metadata(xlsx, "xlsx"))).toBe(digest(xlsx));
  });

  it("rejects an unauthenticated session without following the login redirect", async () => {
    await context.clearCookies();
    await expect(downloadDailyArtifact(page, base, receiptPath, metadata())).rejects.toThrow("network_or_redirect");
    expect(requests.at(-1)).toEqual({ path: receiptPath, hasCookie: false });
    expect(requests.some(({ path }) => path === "/login")).toBe(false);
    expect(synthetic.download).not.toHaveBeenCalled();
  });

  it.each(["same-origin", "other-origin"])("rejects %s signed-style redirects without following or logging their token", async (destination) => {
    const origin = destination === "same-origin" ? base : base.replace("127.0.0.1", "localhost");
    override = () => new Response(null, { status: 307, headers: { location: `${origin}/storage/download?token=${secretMarker}` } });
    let failure;
    try { await downloadDailyArtifact(page, base, receiptPath, metadata()); } catch (error) { failure = error; }
    expect(failure?.message).toContain("network_or_redirect");
    expect(failure?.stack).not.toContain(secretMarker);
    expect(requests.some(({ path }) => path === "/storage/download")).toBe(false);
  });

  it.each([401, 403, 409])("rejects HTTP %i without retaining the response body", async (status) => {
    override = () => new Response(secretMarker, { status });
    await expect(downloadDailyArtifact(page, base, receiptPath, metadata())).rejects.toThrow(`http_status (HTTP ${status})`);
  });

  it.each([
    ["HTML", () => attachment(pdf, "pdf", { "content-type": "text/html" }), "content_type"],
    ["inline response", () => attachment(pdf, "pdf", { "content-disposition": "inline" }), "not_attachment"],
    ["declared length", () => attachment(pdf.subarray(0, -10)), "declared_size"],
    ["truncated stream", () => { const response = attachment(pdf.subarray(0, -10)); response.headers.delete("content-length"); return response; }, "body_size"],
    ["oversized stream", () => { const response = attachment(Buffer.concat([pdf, Buffer.from("extra")])); response.headers.delete("content-length"); return response; }, "body_size"],
    ["wrong PDF signature", () => attachment(Buffer.concat([Buffer.from("xxxxx"), pdf.subarray(5)])), "not a PDF"],
    ["missing PDF trailer", () => attachment(Buffer.concat([pdf.subarray(0, -10), Buffer.alloc(10)])), "PDF is incomplete"],
  ])("rejects %s", async (_label, response, error) => {
    override = response;
    await expect(downloadDailyArtifact(page, base, receiptPath, metadata())).rejects.toThrow(error);
  });

  it("rejects a complete but altered PDF by its stored digest", async () => {
    const changed = Buffer.from(pdf.toString("latin1").replace("RCT-SYNTHETIC", "RCT-DIFFERENT"), "latin1");
    expect(changed.length).toBe(pdf.length);
    override = () => attachment(changed);
    await expect(downloadDailyArtifact(page, base, receiptPath, metadata())).rejects.toThrow("Artifact digest differs");
  });

  it("aborts an unfinished body at the bounded deadline", async () => {
    override = "hang";
    await expect(downloadDailyArtifact(page, base, receiptPath, metadata(), { timeoutMs: 150 })).rejects.toThrow("deadline");
  });

  it("rejects foreign identities, destinations and URL credentials before any request with redacted errors", async () => {
    const count = requests.length;
    for (const href of [
      `${base.replace("127.0.0.1", "localhost")}${receiptPath}?token=${secretMarker}`,
      `${base.replace("http://", `http://user:${secretMarker}@`)}${receiptPath}`,
      `${receiptPath}?token=${secretMarker}`, `${receiptPath}#${secretMarker}`,
      "/api/finance/documents/a2222222-2222-4222-8222-222222222222",
      `http://[${secretMarker}`, `/api/reports/pdf?artifactId=${id}&token=${secretMarker}`,
    ]) {
      let failure;
      try { await downloadDailyArtifact(page, base, href, metadata()); } catch (error) { failure = error; }
      expect(failure).toBeInstanceOf(Error);
      expect(failure.stack).not.toContain(secretMarker);
    }
    expect(requests).toHaveLength(count);
  });
});
