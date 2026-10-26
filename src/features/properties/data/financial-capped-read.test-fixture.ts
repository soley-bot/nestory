import { createCappedReadHarness as createReadHarness } from "@/lib/db/complete-read.test-fixture";

export type { CappedReadRow } from "@/lib/db/complete-read.test-fixture";

// Keep the real financial read fence active while exercising capped source reads.
export function createCappedReadHarness(...args: Parameters<typeof createReadHarness>) {
  const harness = createReadHarness(...args);
  const context = { generation: 2, status: "open", financial_start_date: "2026-10-01", enforced: true };
  return {
    ...harness,
    client: {
      ...harness.client,
      async rpc(name: string) {
        if (name === "get_financial_write_context") return { data: context, error: null };
        if (name === "get_financial_report_context") return { data: { context, source_revision: "4" }, error: null };
        throw new Error(`Unexpected property/unit fixture RPC: ${name}`);
      },
    },
  };
}
