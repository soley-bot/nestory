import assert from "node:assert/strict";
import { z } from "zod";
import { assertDailyOrigin, dailyOrigins, resolveDailyRun } from "./daily-workflow-policy.mjs";

// The shared baseline predates strict UUID validation. Remap only the company
// and three browser actors when seeding the newly owned daily CI database.
// Never rewrite identities in an existing database or relax the application guard.
export const dailyIdentityMap = Object.freeze({
  "00000000-0000-0000-0000-000000000001": "00000000-0000-4000-8000-000000000001",
  "00000000-0000-0000-0000-000000000101": "00000000-0000-4000-8000-000000000101",
  "00000000-0000-0000-0000-000000000701": "00000000-0000-4000-8000-000000000701",
  "00000000-0000-0000-0000-000000000801": "00000000-0000-4000-8000-000000000801",
});

export function dailyIdentity(id) {
  return dailyIdentityMap[id] ?? id;
}

export function assertDailyReceiptIdentities(organizationId, actors) {
  assert.ok(z.uuid().safeParse(organizationId).success, "Daily receipt organization fails strict UUID validation");
  for (const [name, actor] of Object.entries(actors)) {
    assert.ok(z.uuid().safeParse(actor.id).success, `Daily receipt ${name} actor fails strict UUID validation`);
  }
}

export function remapDailyFixtureSql(sql) {
  for (const [before, after] of Object.entries(dailyIdentityMap)) {
    assert.ok(sql.includes(`'${before}'`), "Baseline identity missing; review the daily fixture mapping");
    assert.ok(!sql.includes(after), "Daily fixture identity collision");
    // Includes SQL references and JSON snapshots, keeping all FK/audit links intact.
    sql = sql.replaceAll(before, after);
  }
  return sql;
}

export function fixtureIdentityProfile(env = process.env) {
  if (env.NESTORY_DAILY_FIXTURE_IDENTITIES === undefined) {
    return { id: value => value, sql: value => value, assertApi: () => {} };
  }
  assert.equal(env.NESTORY_DAILY_FIXTURE_IDENTITIES, "1", "Invalid daily fixture profile");
  const run = resolveDailyRun(env);
  assert.equal(env.SUPABASE_DB_CONTAINER, `supabase_db_${run.project}`, "Daily fixture must target its own project");
  assertDailyOrigin(env.NESTORY_BASE_URL, dailyOrigins.app);
  return { id: dailyIdentity, sql: remapDailyFixtureSql, assertApi: value => { assertDailyOrigin(value, dailyOrigins.api); } };
}
