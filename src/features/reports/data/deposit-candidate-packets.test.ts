import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import { isContainedPdf } from "@/lib/uploads/pdf-containment";
import { loadLocalDepositReport, type LocalDepositClient, type LocalDepositScope } from "./deposit-rent-local-source";
import { buildTrustedReportPdf } from "./pdf";
import { buildTrustedReportXlsx } from "./excel";

// Explicit integration replay: inputs are captured by the disposable SQL harness
// under an ordinary authenticated DB role. This is not an Auth/browser test.
const packetPath = process.env.DEPOSIT_CANDIDATE_REPORT_PACKETS;
it.skipIf(!packetPath)("assembles and renders the actual permission-checked report packets", async () => {
  const packets = JSON.parse(readFileSync(packetPath!, "utf8")) as {
    scope: LocalDepositScope; finance: unknown; leases: unknown;
    snapshot: { fingerprint: string; allocations: { application_id: string }[] };
  };
  const sources: Record<string, unknown> = {
    get_finance_read_context: packets.finance,
    get_lease_read_context: packets.leases,
    get_local_lease_deposit_report_snapshot: packets.snapshot,
  };
  const client: LocalDepositClient = { rpc: async name => {
    if (!(name in sources)) throw new Error(`Unexpected source: ${name}`);
    return { data: structuredClone(sources[name]), error: null };
  } };
  const report = await loadLocalDepositReport(client, packets.scope, packets.snapshot.fingerprint);
  expect(report.summary[0].label).toBe("Rent settled from deposits");
  expect(report.summary[0].value).toContain("0.00");
  const pdf = buildTrustedReportPdf({ report, organizationName: "Synthetic company" });
  const workbook = buildTrustedReportXlsx(report);
  expect(isContainedPdf(pdf)).toBe(true);
  const sheet = strFromU8(unzipSync(workbook)["xl/worksheets/sheet1.xml"]);
  for (const row of packets.snapshot.allocations) expect(sheet).toContain(row.application_id);
  expect(sheet).toContain("new bank receipt 0.00");
  expect(sheet).not.toContain("Net operating income");
  if (process.env.DEPOSIT_EXPORT_OUTPUT_DIR) {
    mkdirSync(process.env.DEPOSIT_EXPORT_OUTPUT_DIR, { recursive: true });
    writeFileSync(join(process.env.DEPOSIT_EXPORT_OUTPUT_DIR, "synthetic-deposit-settlements.pdf"), pdf);
    writeFileSync(join(process.env.DEPOSIT_EXPORT_OUTPUT_DIR, "synthetic-deposit-settlements.xlsx"), workbook);
  }
});
