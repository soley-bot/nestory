import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { assertDailyCompletion, assertDailyContainer, dailyOrigins, resolveDailyRun } from "./daily-workflow-policy.mjs";

export const polishDockerHost = "unix:///var/run/docker.sock";
export const polishPassword = "synthetic-polish-password";
export const polishViewports = Object.freeze({
  laptop: { width: 1366, height: 768 },
  compact: { width: 683, height: 384 },
});
export const polishCases = Object.freeze([
  "activation-review-cancel", "activation-review-escape", "activation-stale",
  "activation-confirm", "activation-reload", "ordinary-settings-denied",
  "records-financial", "records-maintenance",
  "reports-laptop", "invoice-laptop", "reports-compact", "invoice-compact",
  "no-email-or-unrelated-authority-change",
]);

export function dailyPolishFixture(env) {
  const run = resolveDailyRun(env);
  const id = label => {
    const hash = createHash("sha256").update(`${run.project}:${run.sha}:polish:${label}`).digest("hex");
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
  };
  const fixture = Object.fromEntries([
    "org", "admin", "adminIdentity", "viewer", "viewerIdentity", "membership",
    "branch", "role", "invitation", "property", "unit", "costEvent", "maintenanceEvent",
  ].map(label => [label, id(label)]));
  const suffix = run.project.replace("nestory-daily-", "");
  return Object.freeze({
    ...fixture,
    adminEmail: `admin-${suffix}@polish.example.test`,
    viewerEmail: `viewer-${suffix}@polish.example.test`,
    invitationEmail: `pending-${suffix}@polish.example.test`,
    organizationName: "Synthetic polish workspace",
    branchName: "Polish primary",
    roleName: "Polish mixed viewer",
    costTitle: "Synthetic maintenance with cost",
    maintenanceTitle: "Synthetic inspection without cost",
    secondBranchName: "Polish second tab branch",
  });
}

export function assertPolishTarget({ env, root, manifest, container, dailyResult, head, buildId }) {
  const run = resolveDailyRun(env);
  assert.equal(manifest.root, root, "Wrong checkout");
  assert.equal(manifest.project, run.project, "Wrong manifest project");
  assert.equal(manifest.sha, run.sha, "Wrong manifest head");
  assert.equal(head, run.sha, "Checkout changed");
  assert.ok(typeof buildId === "string" && buildId.length > 0, "Missing production build");
  assert.equal(env.SUPABASE_DB_CONTAINER, `supabase_db_${run.project}`, "Wrong database selection");
  assert.equal(env.NESTORY_BASE_URL, dailyOrigins.app, "Wrong application origin");
  assert.equal(dailyResult.sha, run.sha, "Daily evidence is from another head");
  assert.equal(dailyResult.complete, true, "Existing daily journey must pass first");
  assertDailyCompletion(dailyResult.phases);
  assertDailyContainer(container, run.project, manifest.createdAt);
  assert.equal(container.Name, `/supabase_db_${run.project}`, "Not the owned database");
  assert.match(container.Id, /^[0-9a-f]{64}$/, "Full container identity required");
  assert.ok(!manifest.beforeNames.includes(container.Name.slice(1)), "Database existed before this run");
  assert.deepEqual(Object.keys(container.NetworkSettings.Networks), [`supabase_network_${run.project}`], "Wrong database network");
  assert.equal(container.State?.Running, true, "Database is not running");
  return container.Id;
}

export function assertPolishCompletion(cases) {
  assert.deepEqual(cases.map(item => item.name), polishCases, "Missing or reordered polish case");
  assert.ok(cases.every(item => item.status === "passed"), "A polish case did not pass");
}

export function redactPolishEvidence(value) {
  return String(value)
    .replaceAll(polishPassword, "[synthetic password redacted]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[JWT redacted]")
    .replace(/sb_(?:publishable|secret)_[A-Za-z0-9_-]+/g, "[key redacted]")
    .replace(/postgres(?:ql)?:\/\/\S+/gi, "[database URL redacted]");
}

// This helper produces SQL only. The smoke caller first attests the completed
// daily run, new project, exact container ID, network, loopback ports and build.
// No baseline IDs, updates, resets, trigger overrides or email APIs are used.
export function dailyPolishSeedSql(env) {
  const f = dailyPolishFixture(env);
  return `BEGIN;
SET LOCAL statement_timeout='15s';
DO $fixture$ BEGIN
  IF EXISTS(SELECT 1 FROM public.organizations WHERE id='${f.org}')
    OR EXISTS(SELECT 1 FROM auth.users WHERE id IN ('${f.admin}','${f.viewer}')
      OR email IN ('${f.adminEmail}','${f.viewerEmail}')) THEN
    RAISE EXCEPTION 'Polish fixture already exists; refuse reuse';
  END IF;
END $fixture$;
INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  confirmation_token,recovery_token,email_change_token_new,email_change,
  email_change_token_current,reauthentication_token,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
SELECT '00000000-0000-0000-0000-000000000000',id,'authenticated','authenticated',email,
  extensions.crypt('${polishPassword}',extensions.gen_salt('bf')),now(),
  '','','','','','','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()
FROM (VALUES ('${f.admin}'::uuid,'${f.adminEmail}'),('${f.viewer}'::uuid,'${f.viewerEmail}')) actor(id,email);
INSERT INTO auth.identities(id,provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
SELECT identity_id,id::text,id,jsonb_build_object('sub',id,'email',email,'email_verified',true,'phone_verified',false),'email',now(),now(),now()
FROM (VALUES ('${f.adminIdentity}'::uuid,'${f.admin}'::uuid,'${f.adminEmail}'),
  ('${f.viewerIdentity}'::uuid,'${f.viewer}'::uuid,'${f.viewerEmail}')) actor(identity_id,id,email);
INSERT INTO public.organizations(id,name,slug) VALUES('${f.org}','${f.organizationName}','polish-${f.org}');
INSERT INTO public.organization_branches(id,organization_id,name,code)
  VALUES('${f.branch}','${f.org}','${f.branchName}','POLISH');
INSERT INTO public.organization_members(organization_id,user_id,role)
  VALUES('${f.org}','${f.admin}','super_admin');
INSERT INTO public.organization_roles(id,organization_id,name) VALUES('${f.role}','${f.org}','${f.roleName}');
INSERT INTO public.organization_role_permissions(organization_id,role_id,permission_key)
  VALUES('${f.org}','${f.role}','finance.view'),('${f.org}','${f.role}','maintenance.view');
INSERT INTO public.organization_members(id,organization_id,user_id,role,branch_id,custom_role_id)
  VALUES('${f.membership}','${f.org}','${f.viewer}','custom','${f.branch}','${f.role}');
INSERT INTO public.organization_invitations(id,organization_id,email,role,branch_id,custom_role_id)
  VALUES('${f.invitation}','${f.org}','${f.invitationEmail}','custom','${f.branch}','${f.role}');
INSERT INTO public.properties(id,organization_id,name,code,property_type)
  VALUES('${f.property}','${f.org}','Synthetic polish property','POLISH-01','apartment');
SELECT set_config('request.jwt.claim.sub','${f.admin}',true);
SET LOCAL ROLE authenticated;
SELECT public.assign_property_branch('${f.org}','${f.property}','${f.branch}');
RESET ROLE;
INSERT INTO public.units(id,organization_id,property_id,unit_number)
  VALUES('${f.unit}','${f.org}','${f.property}','P-01');
INSERT INTO public.timeline_events(id,organization_id,property_id,unit_id,event_date,event_type,title,cost_amount,cost_currency,created_by,updated_by)
  VALUES('${f.costEvent}','${f.org}','${f.property}','${f.unit}',current_date,'Maintenance','${f.costTitle}',5,'USD','${f.admin}','${f.admin}'),
  ('${f.maintenanceEvent}','${f.org}','${f.property}','${f.unit}',current_date,'Inspection','${f.maintenanceTitle}',NULL,NULL,'${f.admin}','${f.admin}');
COMMIT;`;
}

export function polishReadinessSql(f) {
  // The read RPC takes authorization/actor row locks to make its snapshot
  // consistent. PostgreSQL forbids those locks in a READ ONLY transaction.
  return `BEGIN;
SELECT set_config('request.jwt.claim.sub','${f.admin}',true);
SET LOCAL ROLE authenticated;
SELECT public.get_organization_ordinary_access_activation('${f.org}')::text;
ROLLBACK;`;
}

export function assertPolishReadiness(value, f, { enabled = false, branches = 1 } = {}) {
  assert.equal(value.organization_id, f.org);
  assert.equal(value.ordinary_access_enabled, enabled);
  assert.equal(value.activation_ready, !enabled);
  assert.equal(value.active_branch_count, branches);
  assert.equal(value.property_count, 1);
  assert.equal(value.unscoped_property_count, 0);
  assert.equal(value.conflicting_record_count, 0);
  assert.deepEqual(value.blockers, []);
  assert.ok(Number.isSafeInteger(value.authorization_version) && value.authorization_version > 0);
  assert.match(value.impact_fingerprint, /^[0-9a-f]{64}$/);
  assert.equal(value.ordinary_member_count, 1);
  assert.equal(value.live_ordinary_invitation_count, 1);
  assert.equal(value.impact_memberships.length, 1);
  assert.equal(value.impact_invitations.length, 1);
  const assignment = { branch_id: f.branch, branch_name: f.branchName, role_id: f.role, role_name: f.roleName, permission_keys: ["finance.view", "maintenance.view"] };
  assert.deepEqual(value.impact_memberships[0], { ...assignment, membership_id: f.membership, user_id: f.viewer, email: f.viewerEmail });
  assert.deepEqual(value.impact_invitations[0], { ...assignment, invitation_id: f.invitation, email: f.invitationEmail, status: "pending" });
}

export function polishDeliverySnapshotSql(f) {
  const tables = ["public.organization_invitations", "app_private.privileged_email_step_up_challenges", "app_private.privileged_email_step_up_events", "app_private.privileged_email_step_up_grants", "app_private.privileged_email_step_up_policies"];
  return `SELECT jsonb_build_object(${tables.map(table => `'${table}',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') FROM ${table} t WHERE organization_id='${f.org}')`).join(",")})::text;`;
}

export function polishOtherAuthoritySql(f) {
  const tables = ["organization_members", "organization_roles", "organization_role_permissions", "organization_authorization_states", "organization_branches", "organization_invitations"];
  return `SELECT jsonb_build_object(${tables.map(table => `'${table}',(SELECT jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text) FROM public.${table} t WHERE organization_id<>'${f.org}')`).join(",")},'propertyBranches',(SELECT jsonb_agg(jsonb_build_array(id,branch_id) ORDER BY id) FROM public.properties WHERE organization_id<>'${f.org}'))::text;`;
}
