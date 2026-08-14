import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  queryOwnerBalanceFixture,
  validateOwnerBalanceFixture,
} from "./smoke-fixture-owner-balance-lifecycle.mjs";

const manifestUrl = new URL("./fixtures/owner-balance-lifecycle.json", import.meta.url);

test("loaded fixture proves two-property, two-month lifecycle authority", async () => {
  const manifest = JSON.parse(await readFile(manifestUrl, "utf8"));
  const report = queryOwnerBalanceFixture();
  validateOwnerBalanceFixture(report, manifest);
});
