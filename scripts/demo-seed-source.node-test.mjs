import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const seedUrl = new URL("../supabase/seed.sql", import.meta.url);
const seedSql = await readFile(seedUrl, "utf8");

test("the local-only guard runs before any auth or domain mutation", () => {
  const guardIndex = seedSql.indexOf(
    "current_setting('app.settings.jwt_secret', true)",
  );
  const firstAuthInsertIndex = seedSql.indexOf("INSERT INTO auth.users");

  assert.ok(guardIndex >= 0, "local JWT guard is required");
  assert.ok(firstAuthInsertIndex > guardIndex, "guard must precede auth inserts");
  assert.match(seedSql, /seed\.sql is local-only and refused this database/);
});

test("business dates use the controlled reference setting", () => {
  const references =
    seedSql.match(/current_setting\('app\.demo_seed_reference_date'/g) ?? [];
  assert.ok(references.length >= 10);
  assert.match(seedSql, /current_date/);
});

test("all documented local login fixtures remain present", () => {
  for (const email of [
    "nestory@gmail.com",
    "manager@nestory.com",
    "member@nestory.com",
    "demo@nestory.com",
  ]) {
    assert.ok(seedSql.includes(email), `${email} must remain seeded`);
  }
});

test("the seed cannot create broken document or photo metadata", () => {
  assert.doesNotMatch(seedSql, /INSERT INTO public\.documents/i);
  assert.doesNotMatch(seedSql, /INSERT INTO public\.asset_photos/i);
});
