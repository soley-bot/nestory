import { beforeEach, describe, expect, it, vi } from "vitest";
const { rpc, renderCache } = vi.hoisted(() => ({ rpc: vi.fn(), renderCache: new Map<string, unknown>() }));
// Vitest has no RSC dispatcher. Model one render cache and clear it between
// requests so these tests exercise the shared layout/report anchor contract.
vi.mock("react", () => ({ cache: (read: (key: string) => unknown) => (key: string) => {
  if (!renderCache.has(key)) renderCache.set(key, read(key));
  return renderCache.get(key);
} }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: async () => ({ rpc }) }));
import { getFinancialWriteContext, withFinancialDownloadContext, withFinancialIntentReadContext, withFinancialReadContext } from "./financial-write-context.server";
const lifecycle = { generation: 2, status: "open", financial_start_date: "2026-10-01", enforced: true };
const open = { context: lifecycle, source_revision: "4" };
beforeEach(() => {
  renderCache.clear();
  rpc.mockReset();
  rpc.mockImplementation(async name => ({ data: name === "get_financial_write_context" ? lifecycle : open, error: null }));
});
function snapshots(...values: unknown[]) {
  rpc.mockImplementation(async name => name === "get_financial_write_context"
    ? { data: lifecycle, error: null } : values.shift());
}
describe("financial report reset boundary", () => {
  it.each([undefined, "", "02", "1", "2147483648"])("rejects missing, malformed or stale client read intent %j before sources", async (generation) => {
    const intent = new FormData();
    if (generation !== undefined) intent.set("__financialGeneration", generation);
    const read = vi.fn();
    await expect(withFinancialIntentReadContext("org", intent, read)).rejects.toThrow("session changed");
    expect(read).not.toHaveBeenCalled();
  });
  it("checks source changes after a valid original client read intent", async () => {
    const intent = new FormData(); intent.set("__financialGeneration", "2");
    snapshots({ data: open }, { data: { ...open, source_revision: "5" } });
    const read = vi.fn(async () => 25);
    await expect(withFinancialIntentReadContext("org", intent, read)).rejects.toThrow("changed while");
    expect(read).toHaveBeenCalledOnce();
  });
  it("allows missing intent only before enrollment and rejects a supplied malformed value", async () => {
    const legacy = { generation: 0, status: "open", financial_start_date: null, enforced: false };
    rpc.mockImplementation(async name => ({ data: name === "get_financial_write_context" ? legacy : { context: legacy, source_revision: "0" } }));
    await expect(withFinancialIntentReadContext("org", undefined, async () => 25)).resolves.toBe(25);
    const intent = new FormData(); intent.set("__financialGeneration", "bad");
    const read = vi.fn();
    await expect(withFinancialIntentReadContext("org", intent, read)).rejects.toThrow("session changed");
    expect(read).not.toHaveBeenCalled();
  });
  it("shares a layout anchor but freshly checks report source state twice", async () => {
    await getFinancialWriteContext("org");
    const read = vi.fn(async context => ({ total: 25, generation: context.generation }));
    await expect(withFinancialReadContext("org", read, "2026-10-01")).resolves.toEqual({ total: 25, generation: 2 });
    expect(rpc.mock.calls.filter(([name]) => name === "get_financial_write_context")).toHaveLength(1);
    expect(rpc.mock.calls.filter(([name]) => name === "get_financial_report_context")).toHaveLength(2);
  });
  it("rejects reset between the layout anchor and report start before reading sources", async () => {
    await getFinancialWriteContext("org");
    rpc.mockResolvedValue({ data: { ...open, context: { ...lifecycle, generation: 3 } } });
    const read = vi.fn();
    await expect(withFinancialReadContext("org", read)).rejects.toThrow("session changed");
    expect(read).not.toHaveBeenCalled();
  });
  it("keeps a report-first render anchored when the layout loads after reset", async () => {
    await withFinancialReadContext("org", async () => 25);
    rpc.mockResolvedValue({ data: { ...lifecycle, generation: 3 } });
    await expect(getFinancialWriteContext("org")).resolves.toEqual(lifecycle);
    renderCache.clear();
    await expect(getFinancialWriteContext("org")).resolves.toMatchObject({ generation: 3 });
  });
  it("rejects a reset that completes during a multi-query read", async () => {
    snapshots({ data: open }, { data: { ...open, context: { ...lifecycle, generation: 3 } } });
    await expect(withFinancialReadContext("org", async () => 25)).rejects.toThrow("changed while");
  });
  it("rejects ordinary source edits committed during report assembly", async () => {
    snapshots({ data: open }, { data: { ...open, source_revision: "5" } });
    await expect(withFinancialReadContext("org", async () => 25)).rejects.toThrow("changed while");
  });
  it.each(["frozen", "before start"])("does not read source data when %s", async (caseName) => {
    const read = vi.fn();
    if (caseName === "frozen") snapshots({ data: { ...open, context: { ...lifecycle, status: "frozen" } } });
    await expect(withFinancialReadContext("org", read, caseName === "before start" ? "2026-09-01" : "2026-10-01")).rejects.toThrow();
    expect(read).not.toHaveBeenCalled();
  });
  it("fails closed when the status check fails after source loading", async () => {
    snapshots({ data: open }, { data: null, error: { message: "unavailable" } });
    await expect(withFinancialReadContext("org", async () => 25)).rejects.toThrow("could not be verified");
  });
  it.each(["", "?financialGeneration=1", "?financialGeneration=02"])("rejects missing or stale download intent %j before reading the artifact", async (query) => {
    const read = vi.fn();
    await expect(withFinancialDownloadContext("org", new Request(`https://nestory.test/api/reports/pdf${query}`), read))
      .rejects.toThrow("session changed");
    expect(read).not.toHaveBeenCalled();
  });
  it("permits a current download and still checks for source edits after reading it", async () => {
    snapshots({ data: open }, { data: { ...open, source_revision: "5" } });
    const read = vi.fn(async () => new Uint8Array([1, 2]));
    await expect(withFinancialDownloadContext("org", new Request("https://nestory.test/api/reports/pdf?financialGeneration=2"), read))
      .rejects.toThrow("changed while");
    expect(read).toHaveBeenCalledOnce();
  });
  it("keeps legacy download links working for workspaces not enrolled in a reset", async () => {
    const unenrolled = { generation: 0, status: "open", financial_start_date: null, enforced: false };
    rpc.mockImplementation(async (name) => ({ data: name === "get_financial_write_context" ? unenrolled : { context: unenrolled, source_revision: "4" } }));
    await expect(withFinancialDownloadContext("org", new Request("https://nestory.test/api/reports/pdf"), async () => "bytes"))
      .resolves.toBe("bytes");
  });
});
