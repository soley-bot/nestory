import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const files = process.argv.slice(2);
assert.equal(files.length, 2, "Provide two IPS cutover rehearsal evidence files.");
const [first, second] = files.map((file) => JSON.parse(readFileSync(file, "utf8")));
for (const field of [
  "manifestSha256",
  "reconciliationSha256",
  "expectedCounts",
  "actualCounts",
  "expectedTotals",
  "actualTotals",
  "differences",
  "selectedInvoiceCount",
  "unselectedJuneCount",
]) {
  assert.deepEqual(second[field], first[field], `rehearsal drifted at ${field}`);
}
process.stdout.write(`PASS two clean IPS cutover rehearsals are byte-hash/count/money identical\n${JSON.stringify({
  firstDurationMs: first.durationMs,
  manifestSha256: first.manifestSha256,
  reconciliationSha256: first.reconciliationSha256,
  secondDurationMs: second.durationMs,
})}\n`);
