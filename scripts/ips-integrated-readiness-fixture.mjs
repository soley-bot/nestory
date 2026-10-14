import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { localRecoveryDocker } from "./local-recovery-docker.mjs";
import { configuredDepositContainer } from "./deposit-candidate-target.mjs";

export const target = Object.freeze({
  project: "nestory-ips-readiness-20261014",
  api: "http://127.0.0.1:59321",
  app: "http://127.0.0.1:59330",
  container: "supabase_db_nestory-ips-readiness-20261014",
});

export function verifyTarget({ config, status, cwd, handoff }) {
  assert.equal(path.basename(cwd), "ips-production-readiness-20261014", "Wrong worktree");
  assert.equal(configuredDepositContainer(config), target.container, "Wrong local project");
  assert.equal(status.API_URL, target.api, "Wrong local API");
  assert.equal(handoff, target.project, "Explicit local stack handoff is required");
  assert.ok(status.ANON_KEY && status.SERVICE_ROLE_KEY, "Local API keys missing");
}

export function verifyContainer(container, pinnedId) {
  assert.match(container.id, /^[a-f0-9]{64}$/);
  if (pinnedId) assert.equal(container.id, pinnedId, "Dedicated container was replaced");
  assert.equal(container.name, `/${target.container}`);
  assert.equal(container.project, target.project, "Wrong Supabase project label");
  assert.equal(container.running, true);
  assert.ok(container.ports?.some(port => port.HostPort === "59322"), "Wrong local DB port");
}

export async function localHarness(cwd) {
  const status = JSON.parse(readFileSync(path.join(cwd, ".codex-artifacts/isolated-local-status.json"), "utf8").replace(/^\uFEFF/, ""));
  verifyTarget({ config: readFileSync(path.join(cwd, "supabase/config.toml"), "utf8"), status, cwd, handoff: process.env.IPS_LOCAL_HANDOFF });
  const execute = (command, args, input, options = {}) => {
    const result = spawnSync(command, args, { input, encoding: "utf8", shell: false, maxBuffer: 16 * 1024 * 1024, timeout: 120_000, ...options });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  const { docker } = await localRecoveryDocker({ execute });
  function inspect() {
    const format = '{"id":{{json .Id}},"name":{{json .Name}},"project":{{json (index .Config.Labels "com.supabase.cli.project")}},"running":{{json .State.Running}},"ports":{{json (index .NetworkSettings.Ports "5432/tcp")}}}';
    return JSON.parse(docker(["inspect", target.container, "--format", format]));
  }
  const container = inspect();
  verifyContainer(container);
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const admin = createClient(target.api, status.SERVICE_ROLE_KEY, options);
  function sql(statement) {
    verifyContainer(inspect(), container.id);
    return docker(["exec", "-i", container.id, "psql", "-U", "postgres", "-d", "postgres", "-XAt", "-v", "ON_ERROR_STOP=1"], statement).trim();
  }
  async function actor(email, password) {
    const client = createClient(target.api, status.ANON_KEY, options);
    const { error } = await client.auth.signInWithPassword({ email, password });
    assert.equal(error, null, `Real Auth sign-in failed: ${error?.message}`);
    return client;
  }
  async function verifySessionToken(token, actorId) {
    const client = createClient(target.api, status.ANON_KEY, options);
    const { data, error } = await client.auth.getUser(token);
    assert.equal(error, null, "Served app session is not valid in the dedicated local Auth");
    assert.equal(data.user?.id, actorId, "Served app authenticated the wrong synthetic actor");
  }
  return { admin, sql, actor, verifySessionToken };
}

export function quote(value) { return value === null ? "NULL" : `'${String(value).replaceAll("'", "''")}'`; }

// Validate this application's uncompressed summary-card text commands, including
// the exact value directly below its label. Unrelated zero-valued details do not
// establish that a financial total is zero.
export function verifyPdfSummary(bytes, expectedAmount) {
  assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  const texts = [...bytes.toString("latin1").matchAll(/BT \/F\d+ ([\d.]+) Tf 1 0 0 1 ([-\d.]+) ([-\d.]+) Tm \(((?:\\.|[^\\)])*)\) Tj ET/g)]
    .map(match => ({ size: Number(match[1]), x: Number(match[2]), y: Number(match[3]), text: match[4].replace(/\\([\\()])/g, "$1") }));
  const indexes = texts.flatMap((row, index) => row.text === "RENT SETTLED FROM DEPOSITS" ? [index] : []);
  assert.ok(indexes.length, "PDF summary label is missing");
  for (const index of indexes) {
    const label = texts[index], value = texts[index + 1];
    assert.ok(value && value.x === label.x && value.y === label.y - 13 && value.size === 10, "PDF value is not in the matching summary card");
    assert.equal(value.text, `USD ${expectedAmount}`, "PDF summary total mismatch");
  }
}

export function verifySheetSummary(xml, expectedAmount) {
  const decode = value => value.replace(/&(amp|lt|gt|quot|apos);/g, (_, entity) => ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" })[entity]);
  const rows = [...xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)].map(match => Object.fromEntries(
    [...match[1].matchAll(/<c\b[^>]*\br="([A-Z]+)\d+"[^>]*>([\s\S]*?)<\/c>/g)].map(cell =>
      [cell[1], decode([...cell[2].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(text => text[1]).join(""))]),
  ));
  const totals = rows.findIndex(row => row.A === "Totals");
  assert.ok(totals >= 0 && rows[totals + 1]?.A === "Metric" && rows[totals + 1]?.B === "Value", "Workbook totals section missing");
  const summary = rows.slice(totals + 2).filter(row => row.A === "Rent settled from deposits");
  assert.equal(summary.length, 1, "Workbook summary label must occur once in totals");
  assert.equal(summary[0].B, `USD ${expectedAmount}`, "Workbook summary total mismatch");
}

// Resume never infers that a missing file checkpoint means no command ran.
// Persist the observed journal first, then fail closed on any disagreement.
export function verifyResumeState(fixture, observed) {
  const state = fixture.state;
  assert.equal(observed.receipts.length, state.received ? 1 : 0, "Receipt checkpoint disagrees with committed activity; inspect resume-observed.json");
  if (state.received) assert.equal(observed.receipts[0].id, fixture.ids.receiptEvent);
  assert.equal(observed.applications.length, state.reversed ? 2 : state.applied ? 1 : 0, "Application checkpoint disagrees with committed activity; recover the original journal identity from resume-observed.json");
  assert.equal(Number(observed.held), state.received ? state.applied && !state.reversed ? 500 : 600 : 0);
  assert.equal(Number(observed.outstanding), state.applied && !state.reversed ? 500 : 600);
  assert.equal(observed.custodyCurrent, Boolean(state.custody), "Custody checkpoint disagrees with committed activity");
  if (!state.applied) {
    assert.equal(observed.journal, null, "An original journal exists; inspect its saved identity rather than creating a new intent");
  } else {
    assert.equal(observed.journal?.state, "resolved", "An unresolved original journal requires recovery before resume");
    assert.equal(observed.journal.payload.operation, state.reversed ? "reverse" : "apply");
    const proof = state.reversed ? state.reversalIntent : state.applyIntent;
    assert.ok(proof, "Original journal proof was not checkpointed");
    for (const key of ["token", "idempotencyKey", "payloadHash"]) assert.equal(observed.journal[key], proof[key], `Original journal ${key} changed`);
  }
}

export async function rpc(client, name, args) {
  const result = await client.rpc(name, args);
  assert.equal(result.error, null, `${name}: ${result.error?.message}`);
  return result.data;
}

// Non-financial company/role/owner scaffolding uses postgres in this disposable
// local stack. Financial commands below use a genuine signed-in Auth session.
// No RLS changes, trigger disabling, step-up grants, or feature flags are used.
export async function createFixture(harness, checkpoint) {
  const runId = randomUUID();
  const fixture = { runId, password: `Synthetic-${runId}!`, actors: {}, ids: {}, state: {} };
  for (const key of ["org", "foreignOrg", "branch", "otherBranch", "foreignBranch", "fullRole", "readRole", "leaseRole", "owner", "tenant"]) fixture.ids[key] = randomUUID();
  for (const name of ["admin", "operator", "reader", "leaseOnly", "otherBranch", "foreign"]) {
    const email = `ips-${runId.slice(0, 8)}-${name.toLowerCase()}@example.test`;
    const { data, error } = await harness.admin.auth.admin.createUser({ email, password: fixture.password, email_confirm: true });
    assert.equal(error, null, `Create synthetic Auth ${name}: ${error?.message}`);
    fixture.actors[name] = { id: data.user.id, email };
    await checkpoint(fixture);
  }
  const i = fixture.ids, q = quote;
  const permissions = ["properties.view", "people.view", "leases.view", "leases.prepare", "leases.activate", "leases.change_terms", "finance.view", "finance.record_payments", "finance.correct_records"];
  harness.sql(`BEGIN;
    INSERT INTO public.organizations(id,name,slug) VALUES (${q(i.org)},'Synthetic IPS readiness','ips-${runId}'),(${q(i.foreignOrg)},'Foreign synthetic readiness','foreign-${runId}');
    INSERT INTO public.organization_authorization_states(organization_id,ordinary_access_enabled,transition_manifest_required)
      VALUES (${q(i.org)},true,false),(${q(i.foreignOrg)},true,false)
      ON CONFLICT(organization_id) DO UPDATE SET ordinary_access_enabled=true,transition_manifest_required=false;
    INSERT INTO public.organization_branches(id,organization_id,name,code) VALUES (${q(i.branch)},${q(i.org)},'Readiness A','A'),(${q(i.otherBranch)},${q(i.org)},'Readiness B','B'),(${q(i.foreignBranch)},${q(i.foreignOrg)},'Foreign readiness','F');
    INSERT INTO public.organization_roles(id,organization_id,name) VALUES (${q(i.fullRole)},${q(i.org)},'Readiness operator'),(${q(i.readRole)},${q(i.org)},'Readiness reader'),(${q(i.leaseRole)},${q(i.org)},'Readiness lease only');
    INSERT INTO public.organization_role_permissions(organization_id,role_id,permission_key)
      SELECT ${q(i.org)},${q(i.fullRole)},unnest(ARRAY[${permissions.map(q).join(",")}]::public.organization_permission_key[]);
    INSERT INTO public.organization_role_permissions(organization_id,role_id,permission_key)
      SELECT ${q(i.org)},${q(i.readRole)},unnest(ARRAY['properties.view','people.view','leases.view','finance.view']::public.organization_permission_key[]);
    INSERT INTO public.organization_role_permissions(organization_id,role_id,permission_key)
      SELECT ${q(i.org)},${q(i.leaseRole)},unnest(ARRAY['properties.view','people.view','leases.view','leases.change_terms']::public.organization_permission_key[]);
    INSERT INTO public.organization_members(organization_id,user_id,role,branch_id,custom_role_id) VALUES
      (${q(i.org)},${q(fixture.actors.admin.id)},'super_admin',NULL,NULL),
      (${q(i.org)},${q(fixture.actors.operator.id)},'custom',${q(i.branch)},${q(i.fullRole)}),
      (${q(i.org)},${q(fixture.actors.reader.id)},'custom',${q(i.branch)},${q(i.readRole)}),
      (${q(i.org)},${q(fixture.actors.leaseOnly.id)},'custom',${q(i.branch)},${q(i.leaseRole)}),
      (${q(i.org)},${q(fixture.actors.otherBranch.id)},'custom',${q(i.otherBranch)},${q(i.fullRole)}),
      (${q(i.foreignOrg)},${q(fixture.actors.foreign.id)},'super_admin',NULL,NULL);
    INSERT INTO public.people(id,organization_id,display_name,primary_email) VALUES (${q(i.owner)},${q(i.org)},'Synthetic acceptance owner','owner@example.test'),(${q(i.tenant)},${q(i.org)},'Synthetic acceptance tenant','tenant@example.test');
    INSERT INTO public.person_roles(organization_id,person_id,role) VALUES (${q(i.org)},${q(i.owner)},'owner'),(${q(i.org)},${q(i.tenant)},'tenant');
    INSERT INTO public.person_branch_relationships(organization_id,person_id,branch_id) VALUES (${q(i.org)},${q(i.owner)},${q(i.branch)}),(${q(i.org)},${q(i.tenant)},${q(i.branch)});
    COMMIT;`);
  const client = await harness.actor(fixture.actors.admin.email, fixture.password);
  for (const [key, label, code] of [["property", "Synthetic deposit acceptance", "SYN-DEP"], ["volumeProperty", "Synthetic pagination acceptance", "SYN-PAGE"], ["foreignProperty", "Foreign synthetic property", "SYN-FOREIGN"]]) {
    const foreign = key === "foreignProperty", org = foreign ? i.foreignOrg : i.org;
    const actor = foreign ? await harness.actor(fixture.actors.foreign.email, fixture.password) : client;
    i[key] = await rpc(actor, "create_property_minimal", {
      p_organization_id: org, p_branch_id: foreign ? i.foreignBranch : i.branch, p_name: label, p_code: code,
      p_property_type: "Residential apartment", p_address: null, p_registered_date: null,
      p_idempotency_key: `readiness-${runId}-${key}`, p_owner_person_id: foreign ? null : i.owner,
      p_owner_started_on: foreign ? null : "1900-01-01", p_owner_ownership_percent: foreign ? null : 100,
    });
    await rpc(actor, "set_property_rental_structure", { p_organization_id: org, p_property_id: i[key], p_rental_structure: "single_space" });
    await checkpoint(fixture);
  }
  fixture.today = await rpc(client, "get_lease_rent_business_date", { p_organization_id: i.org });
  fixture.month = fixture.today.slice(0, 7);
  fixture.monthStart = `${fixture.month}-01`;
  fixture.monthEnd = new Date(Date.UTC(Number(fixture.month.slice(0, 4)), Number(fixture.month.slice(5)), 0)).toISOString().slice(0, 10);
  const previous = new Date(`${fixture.monthStart}T00:00:00Z`); previous.setUTCMonth(previous.getUTCMonth() - 1);
  fixture.previousMonth = previous.toISOString().slice(0, 10);
  const billing = {
    billingRecipientKind: "individual", billingRecipientPersonId: i.tenant,
    chargeManagementFeeWhenActive: false, chargeThroughLeaseEnd: true,
    collectionRoute: "through_ips", finalPeriodProratedAmount: null, firstPeriodProratedAmount: null,
    fullManagementFeeDuringProration: false, leaseEndProrationRule: "actual_days", leaseStartProrationRule: "actual_days",
    managementFeeMode: "percentage", managementFeeValue: 0, midPeriodRentChangeRule: "next_full_month",
    rentCalculationTimezone: "Asia/Phnom_Penh", shortMonthDueDayRule: "last_calendar_day",
  };
  for (const name of ["deposit", "volume"]) {
    const propertyId = name === "deposit" ? i.property : i.volumeProperty;
    const result = await rpc(client, "create_lease_with_deposit_receipt", {
      p_organization_id: i.org, p_property_id: propertyId, p_unit_id: null, p_primary_tenant_person_id: i.tenant,
      p_lease_start_date: name === "deposit" ? fixture.previousMonth : "1940-01-01", p_lease_end_date: "2100-01-01",
      p_rent_amount: 600, p_rent_currency: "USD", p_rent_due_day: 10, p_payment_frequency: "monthly",
      p_term_status: "draft", p_deposit_amount: name === "deposit" ? 600 : null, p_deposit_currency: name === "deposit" ? "USD" : null,
      p_lease_status: "draft", p_relationship_payload: {}, p_billing_rule: billing,
      p_deposit_received: false, p_deposit_received_amount: null, p_deposit_received_on: null, p_idempotency_key: `readiness-${runId}-${name}`,
    });
    assert.ok(result.leaseId, "Lease authority must return an identity");
    i[`${name}Lease`] = result.leaseId;
    await checkpoint(fixture);
  }
  const occupancyId = harness.sql(`SELECT id FROM public.lease_occupancies WHERE organization_id=${q(i.org)} AND lease_id=${q(i.depositLease)} AND archived_at IS NULL AND evidence_state='accepted' ORDER BY created_at DESC,id LIMIT 1;`);
  await rpc(client, "transition_lease_lifecycle", {
    p_organization_id: i.org, p_lease_id: i.depositLease, p_expected_status: "draft", p_expected_occupancy_id: occupancyId,
    p_transition: "activate", p_effective_date: fixture.previousMonth, p_scheduled_move_out_date: null,
    p_reason: "Synthetic historical occupancy evidence", p_idempotency_key: `readiness-${runId}-activate`,
  });
  const recovered = await rpc(client, "recover_lease_rent_period", { p_organization_id: i.org, p_lease_id: i.depositLease, p_billing_period_start: fixture.previousMonth });
  assert.notEqual(recovered.status, "failed", JSON.stringify(recovered));
  i.depositId = harness.sql(`SELECT id FROM public.lease_deposits WHERE organization_id=${q(i.org)} AND lease_id=${q(i.depositLease)} AND archived_at IS NULL;`);
  i.invoiceId = harness.sql(`SELECT id FROM public.tenant_invoices WHERE organization_id=${q(i.org)} AND lease_id=${q(i.depositLease)} AND billing_period_start=${q(fixture.previousMonth)};`);
  assert.match(i.invoiceId, /^[0-9a-f-]{36}$/);
  i.liabilityAccount = harness.sql(`SELECT id FROM public.finance_accounts WHERE organization_id=${q(i.org)} AND system_role='security_deposits';`);
  fixture.stepUpEnforcement = harness.sql(`SELECT coalesce((SELECT enforcement_enabled FROM app_private.privileged_email_step_up_policies WHERE organization_id=${q(i.org)}),false)::text;`);
  // Volume-only imported miscellaneous obligations: 1,005 unique historical
  // months. Rent creation has its own checked authority; do not bypass that
  // guard for bulk test setup. These tenant charges also belong in the register
  // and stay separate from the lease proving actual rent/deposit commands.
  harness.sql(`BEGIN;
    WITH months AS (SELECT n,('1940-01-01'::date + make_interval(months=>n))::date AS period_start FROM generate_series(0,1004) n)
    INSERT INTO public.tenant_invoices(organization_id,invoice_number,property_id,lease_id,billing_term_id,billing_period_start,billing_period_end,issue_date,due_date,collection_route,recipient_kind,recipient_person_id,recipient_label,total_amount,lifecycle)
      SELECT ${q(i.org)},'SYN-PAGE-'||lpad(n::text,4,'0'),${q(i.volumeProperty)},${q(i.volumeLease)},
        (SELECT id FROM public.lease_billing_terms WHERE organization_id=${q(i.org)} AND lease_id=${q(i.volumeLease)} AND archived_at IS NULL LIMIT 1),
        period_start,(period_start+interval '1 month - 1 day')::date,period_start,period_start+9,'through_ips','individual',${q(i.tenant)},'Synthetic pagination tenant',10.01,'issued' FROM months;
    INSERT INTO public.finance_income_items(organization_id,property_id,lease_id,payer_label,due_date,amount_due,reference,income_type)
      SELECT organization_id,property_id,lease_id,recipient_label,due_date,total_amount,invoice_number,'other' FROM public.tenant_invoices WHERE organization_id=${q(i.org)} AND property_id=${q(i.volumeProperty)};
    INSERT INTO public.tenant_invoice_lines(organization_id,invoice_id,income_item_id,line_type,customer_label,amount,sort_order,property_id,currency,recognized_on)
      SELECT invoice.organization_id,invoice.id,income.id,'other','Synthetic imported charge',invoice.total_amount,1,invoice.property_id,'USD',invoice.issue_date
      FROM public.tenant_invoices invoice JOIN public.finance_income_items income ON income.organization_id=invoice.organization_id AND income.reference=invoice.invoice_number
      WHERE invoice.organization_id=${q(i.org)} AND invoice.property_id=${q(i.volumeProperty)};
    COMMIT;`);
  fixture.state.setupComplete = true;
  await checkpoint(fixture);
  return fixture;
}
