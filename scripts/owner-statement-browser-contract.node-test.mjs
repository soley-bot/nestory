import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const acceptance = new URL("./smoke-owner-statement-browser-acceptance.mjs", import.meta.url);

test("Owner Statement acceptance retains one real-role and retained-byte lifecycle", async () => {
  const source = await readFile(acceptance, "utf8");
  for (const actor of ["super_admin", "finance_manager", "operations_manager"]) {
    assert.match(source, new RegExp(`${actor}:`));
  }
  for (const evidence of [
    "owner_statement_publications",
    "owner_statement_artifacts",
    "financial_idempotency_requests",
    "publicationSnapshot",
    "artifactRows",
    "content_hash",
    "sha256",
    "size_bytes",
  ]) assert.match(source, new RegExp(evidence));
  for (const visibleStep of [
    "Ready to close revision 4",
    "Close revision 4",
    "Publish Owner Statement",
    "Download PDF",
    "Download Excel",
    "Superseded",
  ]) assert.match(source, new RegExp(visibleStep.replaceAll(" ", "\\s")));
  assert.match(source, /Open workspace/);
  assert.match(source, /a\[href="\/balances"\]/);
  assert.match(source, /loadBaseline\(\);[\s\S]*finally[\s\S]*loadBaseline\(\);/);
});
