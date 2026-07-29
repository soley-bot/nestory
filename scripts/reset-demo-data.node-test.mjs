import assert from "node:assert/strict";
import test from "node:test";

import {
  assertReferenceDate,
  buildResetArgs,
  buildSeedInput,
  parseArgs,
} from "./reset-demo-data.mjs";

test("parseArgs accepts an explicit reference date", () => {
  assert.deepEqual(parseArgs(["--reference-date", "2030-01-15"]), {
    referenceDate: "2030-01-15",
    help: false,
  });
});

test("reference dates are real calendar dates", () => {
  assert.equal(assertReferenceDate("2028-02-29"), "2028-02-29");
  assert.throws(() => assertReferenceDate("2027-02-29"), /real calendar date/);
  assert.throws(() => assertReferenceDate("01-15-2030"), /YYYY-MM-DD/);
});

test("unknown arguments fail closed", () => {
  assert.throws(() => parseArgs(["--execute"]), /Unknown argument/);
});

test("seed replay sets the date before any seed statement", () => {
  const input = buildSeedInput("SELECT current_date;", "2030-01-15");
  assert.match(
    input,
    /^SET app\.demo_seed_reference_date = '2030-01-15';\nSELECT current_date;/,
  );
});

test("dated resets skip automatic seeding before the controlled replay", () => {
  assert.deepEqual(buildResetArgs(null), ["supabase", "db", "reset"]);
  assert.deepEqual(buildResetArgs("2030-01-15"), [
    "supabase",
    "db",
    "reset",
    "--no-seed",
  ]);
});
