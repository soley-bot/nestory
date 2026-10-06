import assert from "node:assert/strict";
import { assertDailyReceiptIdentities, dailyIdentity } from "./daily-fixture-identities.mjs";

export const dailyFixture = Object.freeze({
  org: dailyIdentity("00000000-0000-0000-0000-000000000001"),
  branch: "00000000-0000-0000-0000-000000000211",
  property: "10000000-0000-0000-0000-000000000001",
  unit: "20000000-0000-0000-0000-000000000003",
  owner: "80000000-0000-0000-0000-000000000004",
  tenant: "d1000000-0000-0000-0000-000000000001",
});
export const dailyActors = Object.freeze({
  setup: { id: dailyIdentity("00000000-0000-0000-0000-000000000101"), email: "nestory@gmail.com", role: "super_admin" },
  finance: { id: dailyIdentity("00000000-0000-0000-0000-000000000701"), email: "finance.manager@nestory.com", role: "custom", roleId: "00000000-0000-0000-0000-000000000311" },
  reader: { id: dailyIdentity("00000000-0000-0000-0000-000000000801"), email: "finance.member@nestory.com", role: "custom", roleId: "00000000-0000-0000-0000-000000000312" },
});
export const dailyAuthority = Object.freeze([
  { phase: "move-in", actor: "setup", permissions: ["properties.view", "leases.view", "leases.prepare", "leases.activate"] },
  { phase: "payment", actor: "finance", permissions: ["finance.view", "finance.record_payments"] },
  { phase: "monthly-correction", actor: "finance", permissions: ["leases.view", "finance.view", "finance.correct_records"] },
  { phase: "receipt", actor: "finance", permissions: ["finance.view"] },
  { phase: "owner-statement", actor: "finance", permissions: ["finance.view", "finance.record_payments", "finance.close_periods", "finance.publish"] },
]);
export const dailyPermissions = [...new Set(dailyAuthority.flatMap(phase => phase.permissions))];

export function dailyDates(businessDate) {
  assert.match(businessDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(new Date(`${businessDate}T00:00:00Z`).toISOString().slice(0, 10), businessDate);
  const month = `${businessDate.slice(0, 7)}-01`;
  const end = new Date(`${month}T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 6);
  return { businessDate, month, end: end.toISOString().slice(0, 10) };
}
export function dailyInvoiceHref(invoiceId) {
  assert.match(invoiceId, /^[a-f0-9-]{36}$/);
  return `/rent-income?invoiceId=${invoiceId}`;
}
export function dailyOwnerHref(month) {
  assert.match(month, /^\d{4}-\d{2}-01$/);
  return `/balances?${new URLSearchParams({ view: "summary", month: month.slice(0, 7), propertyId: dailyFixture.property, ownerPersonId: dailyFixture.owner })}`;
}
export function assertDailyAuthorities(actors) {
  for (const [key, expected] of Object.entries(dailyActors)) {
    const actual = actors[key];
    assert.equal(actual?.role, expected.role, `${key} actor role changed`);
    assert.equal(actual.email, expected.email, `${key} login identity changed`);
    if (expected.roleId) {
      assert.equal(actual.roleId, expected.roleId);
      assert.equal(actual.branch, dailyFixture.branch);
    }
    for (const permission of dailyAuthority.filter(phase => phase.actor === key).flatMap(phase => phase.permissions)) {
      assert.equal(actual.permissions[permission], true, `${key} lacks assigned-property ${permission}`);
    }
  }
  assert.equal(actors.finance.permissions["properties.view"], false, "Do not expand Finance Manager setup authority");
  for (const permission of ["leases.view", "finance.view"]) assert.equal(actors.reader.permissions[permission], true);
  for (const permission of ["finance.record_payments", "finance.correct_records", "finance.close_periods", "finance.publish"]) {
    assert.equal(actors.reader.permissions[permission], false, `Finance Member unexpectedly has ${permission}`);
  }
  assert.equal(actors.finance.unassignedProperty, false, "Ordinary actor must not access an unknown property");
}

// Page loaders require this RPC independently of the permission-key resolver.
// Probe it as the actual actor; never fall back to an administrator or UTC clock.
export function readDailyBusinessDate(sql, actorName) {
  const actor = dailyActors[actorName];
  assert.ok(actor, "Unknown daily workflow actor");
  try {
    const date = sql(`BEGIN READ ONLY;
      SELECT set_config('request.jwt.claim.sub','${actor.id}',true);
      SET LOCAL ROLE authenticated;
      SELECT public.get_lease_rent_business_date('${dailyFixture.org}')::text;
      ROLLBACK;`).trim().split(/\r?\n/).at(-1);
    dailyDates(date);
    return date;
  } catch (cause) {
    throw new Error(`Daily fixture contract failed: ${actorName} cannot read get_lease_rent_business_date as authenticated; no fallback is allowed`, { cause });
  }
}

// Invoked only after the orchestrator has verified its newly owned disposable DB.
// Every statement is read-only; no fixture, permission or financial repair occurs here.
export function inspectDailyFixture(sql) {
  assertDailyReceiptIdentities(dailyFixture.org, dailyActors);
  const { org, branch, property, unit, owner, tenant } = dailyFixture;
  const json = statement => JSON.parse(sql(`BEGIN READ ONLY; ${statement} COMMIT;`).trim().split(/\r?\n/).at(-1));
  const actors = Object.fromEntries(Object.entries(dailyActors).map(([key, actor]) => [key, json(`
    SELECT set_config('request.jwt.claim.sub','${actor.id}',true);
    SELECT json_build_object('role',m.role,'roleId',m.custom_role_id,'branch',m.branch_id,'email',u.email,
      'permissions',json_build_object(${dailyPermissions.map(permission => `'${permission}',app_private.can_access_property('${org}','${property}','${permission}')`).join(",")}),
      'unassignedProperty',app_private.can_access_property('${org}','ffffffff-ffff-ffff-ffff-ffffffffffff','finance.view'))::text
    FROM public.organization_members m JOIN auth.users u ON u.id=m.user_id WHERE m.organization_id='${org}' AND m.user_id='${actor.id}';
  `)]));
  assertDailyAuthorities(actors);
  const businessDates = Object.fromEntries(Object.keys(dailyActors).map(actor => [actor, readDailyBusinessDate(sql, actor)]));
  assert.equal(businessDates.finance, businessDates.setup, "Actors disagree on company business date");
  assert.equal(businessDates.reader, businessDates.setup, "Lease reader must use the same company business date");
  const fixture = json(`SELECT set_config('request.jwt.claim.sub','${dailyActors.setup.id}',true);
    SELECT json_build_object(
      'businessDate',public.get_lease_rent_business_date('${org}')::text,
      'vacant',EXISTS(SELECT 1 FROM public.units WHERE id='${unit}' AND property_id='${property}' AND archived_at IS NULL)
        AND NOT EXISTS(SELECT 1 FROM public.current_leases WHERE unit_id='${unit}' AND status IN ('active','draft','notice_given')),
      'newTenant',NOT EXISTS(SELECT 1 FROM public.people WHERE id='${tenant}'),
      'owner',EXISTS(SELECT 1 FROM public.property_owners WHERE property_id='${property}' AND person_id='${owner}' AND ended_on IS NULL AND archived_at IS NULL),
      'unlocked',NOT EXISTS(SELECT 1 FROM public.financial_month_locks WHERE organization_id='${org}' AND (branch_id IS NULL OR branch_id='${branch}') AND is_locked AND month_start=date_trunc('month',public.get_lease_rent_business_date('${org}'))::date),
      'unclosed',NOT EXISTS(SELECT 1 FROM public.owner_close_series WHERE organization_id='${org}' AND property_id='${property}' AND owner_person_id='${owner}' AND month_start=date_trunc('month',public.get_lease_rent_business_date('${org}'))::date AND state IN ('closed','stale')),
      'account',(SELECT json_build_object('id',a.id,'name',a.display_name) FROM public.finance_accounts a JOIN public.finance_account_roles r ON r.organization_id=a.organization_id AND r.account_id=a.id WHERE a.organization_id='${org}' AND r.role_code='operating_bank' AND a.account_class='asset' AND a.account_subtype='bank' AND a.archived_at IS NULL AND (a.property_id IS NULL OR a.property_id='${property}')),
      'pendingOpeningReviews',(SELECT coalesce(json_agg(json_build_object('id',id,'submittedBy',submitted_by)),'[]') FROM public.owner_opening_balance_requests WHERE organization_id='${org}' AND property_id='${property}' AND owner_person_id='${owner}' AND status='submitted')
    )::text;`);
  for (const key of ["vacant", "newTenant", "owner", "unlocked", "unclosed"]) assert.equal(fixture[key], true, `Synthetic fixture precondition failed: ${key}`);
  assert.match(fixture.account?.id ?? "", /^[a-f0-9-]{36}$/);
  assert.ok(fixture.account.name);
  for (const request of fixture.pendingOpeningReviews) {
    assert.notEqual(request.submittedBy, dailyActors.setup.id, "Independent fixture reviewer cannot review their own request");
  }
  const pendingSources = json(`SELECT set_config('request.jwt.claim.sub','${dailyActors.finance.id}',true);
    SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]')::text FROM public.get_owner_event_allocation_queue('${org}','${property}','USD',date_trunc('month',public.get_lease_rent_business_date('${org}'))::date,(date_trunc('month',public.get_lease_rent_business_date('${org}'))+interval '1 month - 1 day')::date) q WHERE q.allocation_state<>'allocated';`);
  assert.deepEqual(pendingSources, [], "Baseline owner sources must already be allocated; never repair unrelated fixture accounting during the journey");
  assert.equal(fixture.businessDate, businessDates.finance, "Company business date changed during fixture preflight");
  return { actors, ...fixture, dates: dailyDates(fixture.businessDate) };
}
