import { beforeEach, describe, expect, it, vi } from "vitest";
const { single, download, prepare, eq } = vi.hoisted(() => ({ single: vi.fn(), download: vi.fn(), prepare: vi.fn(), eq: vi.fn() }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: async () => ({ from: () => ({ select: () => ({ eq }) }), storage: { from: () => ({ download }) } }) }));
vi.mock("./paid-cost-evidence", () => ({ preparePaidCostEvidence: prepare }));
import { retainExpenseEvidence } from "./retain-expense-evidence";
const input = { organizationId: "org", actorId: "actor", transactionId: "original", propertyId: "property", idempotencyKey: "retry-key" };
beforeEach(() => { vi.clearAllMocks(); eq.mockReturnValue({ eq, single }); });
describe("receipt retention during expense correction", () => {
  it("revalidates and registers a separate copy of the authorized original bytes", async () => {
    single.mockResolvedValueOnce({ data: { supporting_document_id: "original-doc" } }).mockResolvedValueOnce({ data: { storage_path: "org/original.pdf", file_name: "receipt.pdf", mime_type: "application/pdf" } });
    download.mockResolvedValue({ data: new Blob(["%PDF-1.4 receipt"], { type: "application/pdf" }) });
    prepare.mockResolvedValue({ documentId: "new-doc" });
    expect(await retainExpenseEvidence(input)).toBe("new-doc");
    expect(eq).toHaveBeenCalledWith("organization_id", "org");
    expect(download).toHaveBeenCalledWith("org/original.pdf");
    const submitted = prepare.mock.calls[0][0];
    expect(submitted.idempotencyKey).toBe("retry-key");
    expect(submitted.file.name).toBe("receipt.pdf");
    expect(await submitted.file.text()).toBe("%PDF-1.4 receipt");
  });
  it("keeps an expense without a receipt optional", async () => {
    single.mockResolvedValueOnce({ data: { supporting_document_id: null } });
    expect(await retainExpenseEvidence(input)).toBeNull(); expect(download).not.toHaveBeenCalled();
  });
  it("does not use elevated access when the original is hidden or missing", async () => {
    single.mockResolvedValueOnce({ data: null, error: { message: "denied" } });
    await expect(retainExpenseEvidence(input)).rejects.toThrow("Original expense is unavailable");
    expect(download).not.toHaveBeenCalled(); expect(prepare).not.toHaveBeenCalled();
  });
  it("does not silently drop a receipt when its bytes cannot be read", async () => {
    single.mockResolvedValueOnce({ data: { supporting_document_id: "original-doc" } }).mockResolvedValueOnce({ data: { storage_path: "org/original.pdf", file_name: "receipt.pdf", mime_type: "application/pdf" } });
    download.mockResolvedValue({ data: null, error: { message: "denied" } });
    await expect(retainExpenseEvidence(input)).rejects.toThrow("Original receipt is unavailable");
    expect(prepare).not.toHaveBeenCalled();
  });
});
