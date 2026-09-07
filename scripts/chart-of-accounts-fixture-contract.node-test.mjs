import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const fixturePath = new URL(
  "../supabase/test-fixtures/baseline.sql",
  import.meta.url,
);

test("the guarded fixture creates a stable mapped nested Plumbing account without a real account number", async () => {
  const fixture = await readFile(fixturePath, "utf8");

  assert.match(fixture, /a1000000-0000-4000-8000-000000000001/);
  assert.match(fixture, /'Plumbing'/);
  assert.match(fixture, /display_name = 'Repairs and maintenance'/);
  assert.match(fixture, /'Synthetic local fixture account; no real account number\.'/);
  assert.match(
    fixture,
    /NULL,[\s\S]*?'Plumbing',[\s\S]*?'Synthetic local fixture account; no real account number\.'/,
  );
  assert.match(fixture, /a2000000-0000-4000-8000-000000000001/);
  assert.match(fixture, /'fixture_plumbing'/);
  assert.doesNotMatch(
    fixture,
    /INSERT INTO public\.finance_account_category_links[\s\S]*?a2000000-0000-4000-8000-000000000001/,
  );
});
