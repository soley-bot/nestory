import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("./smoke-ips-cutover-browser-acceptance.mjs", import.meta.url),
  "utf8",
);

test("Track 9 browser acceptance retains the complete role and database lifecycle", () => {
  for (const required of [
    'page.goto(`${baseUrl}/import`',
    "Stage cutover manifest",
    "cutover import run not reconciled",
    "Commit reconciled cutover",
    "Replay reconciled cutover",
    "ips_cutover_reconciliations",
    "2026-06-01",
    "Finance Manager",
    "Operations Manager",
    "loadBaseline();",
  ]) {
    assert.match(source, new RegExp(required.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});
