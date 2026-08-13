import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const browserAcceptanceUrl = new URL(
  "./smoke-owner-close-browser-acceptance.mjs",
  import.meta.url,
);

test("owner-close acceptance is retained as one real role and database lifecycle", async () => {
  const source = await readFile(browserAcceptanceUrl, "utf8");

  for (const actor of [
    "super_admin",
    "finance_manager",
    "finance_member",
    "operations_manager",
    "operations_member",
  ]) {
    assert.match(source, new RegExp(`${actor}:`));
  }

  for (const requiredEvidence of [
    "get_owner_close_readiness",
    "owner_close_revisions",
    "owner_close_corrections",
    "owner_close_line_sources",
    "financial_idempotency_requests",
    "frozenRevisionSnapshot",
    "revisionOneSnapshot",
    "content_hash",
    "supersedes_revision_id",
  ]) {
    assert.match(source, new RegExp(requiredEvidence));
  }

  assert.match(source, /goto\(`\$\{baseUrl\}\/workspace/);
  assert.match(source, /waitForURL\(\(url\) => url\.pathname !== "\/workspace"/);
  assert.match(source, /Expand\|Collapse\) Finance navigation/);
  assert.match(source, /a\[href="\/balances"\]/);
  assert.equal(
    [...source.matchAll(/goto\(`\$\{baseUrl\}\/balances/g)].length,
    1,
    "only the explicit Operations denial probe may navigate directly to /balances",
  );

  for (const operatorStep of [
    "Ready to close owner month · revision 1",
    "Close owner month",
    "Reopen month",
    "Record correction",
    "Generate month",
    "Close owner month",
    "Revision 1 - Closed",
    "Revision 2 - Closed",
  ]) {
    assert.match(source, new RegExp(operatorStep.replaceAll(" ", "\\s")));
  }

  assert.match(source, /loadBaseline\(\);[\s\S]*finally[\s\S]*loadBaseline\(\);/);
  assert.match(source, /Operations role route denial/);
  assert.match(source, /Finance role frozen-history/);
});
