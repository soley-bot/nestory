import { describe, expect, it, vi } from "vitest";
import { loadReportDocuments } from "./report-documents";

const document = (id: string) => ({ id, file_name: "Evidence.pdf", property_id: "p1", unit_id: null,
  lease_id: null, ledger_entry_id: null, timeline_event_id: null });

describe("bounded report document statement snapshot", () => {
  it("retains the SQL snapshot's explicit 5,000 document boundary", async () => {
    const documents = Array.from({ length: 5000 }, (_, index) => document(String(index).padStart(5, "0")));
    const rpc = vi.fn(async () => ({ data: { count: documents.length, documents }, error: null }));
    expect(await loadReportDocuments({ rpc }, "org")).toHaveLength(5000);
    expect(rpc).toHaveBeenCalledWith("get_report_documents_snapshot", { p_organization_id: "org" });
    documents.push(document("05000"));
    await expect(loadReportDocuments({ rpc }, "org")).rejects.toThrow("5,000");
  });

  it.each([
    { count: 1, documents: [] },
    { count: 0, documents: [document("a")] },
    { count: 2, documents: [document("a"), document("a")] },
    { count: 2, documents: [document("b"), document("a")] },
    { count: null, documents: [] },
  ])("rejects partial or invalid snapshot %j", async data => {
    await expect(loadReportDocuments({ rpc: async () => ({ data, error: null }) }, "org")).rejects.toThrow();
  });
});
