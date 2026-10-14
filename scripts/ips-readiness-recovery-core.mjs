import { createHash } from "node:crypto";

export const RECOVERY_PROJECT = "nestory-ips-readiness-20261014";
export const RECOVERY_CONTAINER = `supabase_db_${RECOVERY_PROJECT}`;
export const FIXTURE_ORGANIZATION = "00000000-0000-0000-0000-000000000001";
export const FIXTURE_USERS = [101, 501, 601, 701, 801].map(number => `00000000-0000-0000-0000-${String(number).padStart(12, "0")}`);
export const VERIFIED_SCHEMAS = ["app_private", "auth", "public", "storage", "supabase_migrations"];
const schemaList = VERIFIED_SCHEMAS.map(name => `'${name}'`).join(",");

// PostgreSQL stores a null ACL for its built-in owner/PUBLIC defaults. Sorting
// typed ACL items preserves grantees, grantors, privileges and grant options.
const canonicalAclSql = (acl, defaults) => `(SELECT coalesce(jsonb_agg(item::text ORDER BY item::text),'[]'::jsonb)::text FROM unnest(coalesce(${acl},${defaults})) item)`;

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function assertRecoverySource({ config, manifest, fixtureHash, now = Date.now(), explicitContainer }) {
  const projects = [...config.matchAll(/^\s*project_id\s*=\s*"([A-Za-z0-9_-]+)"\s*$/gm)];
  if (projects.length !== 1 || projects[0][1] !== RECOVERY_PROJECT) throw Error("Recovery requires the exact isolated readiness project.");
  if (explicitContainer && explicitContainer !== RECOVERY_CONTAINER) throw Error("Recovery refuses a different explicit container.");
  if (manifest.project !== RECOVERY_PROJECT || manifest.sourceKind !== "fresh-reset-plus-committed-synthetic-baseline") throw Error("Recovery source manifest identity is invalid.");
  if (!/^[a-f0-9]{64}$/.test(manifest.containerId) || manifest.fixtureSha256 !== fixtureHash) throw Error("Recovery source container or fixture fingerprint is invalid.");
  const age = now - Date.parse(manifest.loadedAt);
  if (!Number.isFinite(age) || age < -60_000 || age > 2 * 60 * 60_000) throw Error("Recovery source manifest is stale or has an invalid timestamp.");
  assertFixtureIdentities(manifest);
}

export function assertFixtureIdentities({ organizationIds, authUserIds }) {
  const organizations = Array.isArray(organizationIds) ? organizationIds : [organizationIds];
  if (JSON.stringify([...organizations].sort()) !== JSON.stringify([FIXTURE_ORGANIZATION]) ||
      !Array.isArray(authUserIds) || JSON.stringify([...authUserIds].sort()) !== JSON.stringify(FIXTURE_USERS)) {
    throw Error("Recovery source contains identities outside the committed synthetic fixture.");
  }
}

export function assertRecoveryContainer(inspect, expectedId) {
  if (inspect.name !== `/${RECOVERY_CONTAINER}` || inspect.id !== expectedId || !inspect.running ||
      inspect.project !== RECOVERY_PROJECT || !/^sha256:[a-f0-9]{64}$/.test(inspect.image)) {
    throw Error("Recovery container identity or project ownership changed.");
  }
}

export function recoveryIdentity(uuid) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(uuid)) throw Error("Recovery requires a fresh generated UUID.");
  return { database: `ips_recovery_${uuid.replaceAll("-", "")}`, marker: `nestory-synthetic-recovery:${uuid}`, dumpPath: `/tmp/nestory-ips-recovery-${uuid}.dump` };
}

export function assertRecoveryCleanup(identity, row) {
  if (!row || !Number.isSafeInteger(identity.oid) || identity.oid <= 0 || !/^ips_recovery_[a-f0-9]{32}$/.test(identity.database) || row.name !== identity.database ||
      row.comment !== identity.marker || row.owner !== "postgres" || row.oid !== identity.oid) {
    throw Error("Refusing cleanup of a database without this run's exact ownership marker and identity.");
  }
}

export function parseJsonLines(value) {
  return value.trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
}

export function compareEvidence(before, after, label) {
  const canonical = value => JSON.stringify([...value].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
  if (canonical(before) !== canonical(after)) throw Error(`${label} integrity comparison failed.`);
  return sha256(canonical(before));
}

export function assertUniqueObjectKeys(objects) {
  const keys = new Set();
  for (const object of objects) {
    const key = JSON.stringify([object.kind, object.name]);
    if (keys.has(key)) throw Error("Schema census contains duplicate object identities.");
    keys.add(key);
  }
}

// Each generated statement is a SELECT. Object identifiers originate in the
// catalog, are identifier-quoted by PostgreSQL, and remain in fixed schemas.
export const tableCensusSql = `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='30s'; SET LOCAL timezone='UTC';
SELECT format($q$SELECT jsonb_build_object('kind','table','schema',%L,'name',%L,'rows',count(*),'sha256',encode(extensions.digest(coalesce(string_agg(encode(extensions.digest(to_jsonb(t)::text,'sha256'),'hex'),'' ORDER BY encode(extensions.digest(to_jsonb(t)::text,'sha256'),'hex')),''),'sha256'),'hex')) FROM %I.%I t$q$,n.nspname,c.relname,n.nspname,c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN (${schemaList}) AND c.relkind='r' ORDER BY n.nspname,c.relname
\\gexec
SELECT format($q$SELECT jsonb_build_object('kind','sequence','schema',%L,'name',%L,'lastValue',last_value,'isCalled',is_called) FROM %I.%I$q$,n.nspname,c.relname,n.nspname,c.relname)
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname IN (${schemaList}) AND c.relkind='S' ORDER BY n.nspname,c.relname
\\gexec
COMMIT;`;

export const schemaCensusSql = `BEGIN READ ONLY;
SET LOCAL statement_timeout='30s'; SET LOCAL search_path=pg_catalog,public;
WITH objects AS (
 SELECT 'schema'::text kind,n.nspname::text name,jsonb_build_array(pg_get_userbyid(n.nspowner),${canonicalAclSql("n.nspacl", "acldefault('n',n.nspowner)")})::text definition FROM pg_namespace n WHERE n.nspname IN (${schemaList})
 UNION ALL SELECT 'relation',n.nspname::text||'.'||c.relname::text,jsonb_build_array(c.relkind,c.relrowsecurity,c.relforcerowsecurity,c.relreplident,pg_get_userbyid(c.relowner),${canonicalAclSql("c.relacl", "acldefault(CASE WHEN c.relkind='S' THEN 's'::\"char\" ELSE 'r'::\"char\" END,c.relowner)")},CASE WHEN c.relkind IN ('v','m') THEN pg_get_viewdef(c.oid,true) END)::text FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN (${schemaList}) AND c.relkind IN ('r','p','v','m','S')
 UNION ALL SELECT 'column',n.nspname::text||'.'||c.relname::text||'.'||a.attname::text,jsonb_build_array(row_number() OVER(PARTITION BY c.oid ORDER BY a.attnum),format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid))::text FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname IN (${schemaList}) AND c.relkind IN ('r','p','v','m') AND a.attnum>0 AND NOT a.attisdropped
 UNION ALL SELECT 'constraint',n.nspname::text||'.'||c.relname::text||'.'||x.conname::text,pg_get_constraintdef(x.oid,true)||':'||x.convalidated::text FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN (${schemaList})
 UNION ALL SELECT 'index',schemaname::text||'.'||indexname::text,indexdef FROM pg_indexes WHERE schemaname IN (${schemaList})
 UNION ALL SELECT 'policy',schemaname::text||'.'||tablename::text||'.'||policyname::text,jsonb_build_array(permissive,roles,cmd,qual,with_check)::text FROM pg_policies WHERE schemaname IN (${schemaList})
 UNION ALL SELECT 'function',n.nspname::text||'.'||p.proname::text||'('||pg_get_function_identity_arguments(p.oid)||')',jsonb_build_array(pg_get_functiondef(p.oid),${canonicalAclSql("p.proacl", "acldefault('f',p.proowner)")},pg_get_userbyid(p.proowner))::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN (${schemaList}) AND p.prokind IN ('f','p','w')
 UNION ALL SELECT 'trigger',n.nspname::text||'.'||c.relname::text||'.'||t.tgname::text,pg_get_triggerdef(t.oid,true)||':'||t.tgenabled::text FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN (${schemaList}) AND NOT t.tgisinternal
 UNION ALL SELECT 'enum',n.nspname::text||'.'||t.typname::text,string_agg(e.enumlabel,',' ORDER BY e.enumsortorder) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN (${schemaList}) GROUP BY n.nspname,t.typname
 UNION ALL SELECT 'default_acl',coalesce(n.nspname::text,'global')||'.'||pg_get_userbyid(d.defaclrole)::text||'.'||d.defaclobjtype::text,${canonicalAclSql("d.defaclacl", "'{}'::aclitem[]")} FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace WHERE n.nspname IN (${schemaList}) OR d.defaclnamespace=0
) SELECT jsonb_build_object('kind',kind,'name',name,'sha256',encode(extensions.digest(definition,'sha256'),'hex')) FROM objects ORDER BY kind,name;
COMMIT;`;

export const catalogCanonicalizationChecksSql = `BEGIN READ ONLY;
WITH cases(name,left_acl,right_acl,equivalent) AS (VALUES
 ('acl_order',ARRAY['postgres=r/postgres','anon=r/postgres']::aclitem[],ARRAY['anon=r/postgres','postgres=r/postgres']::aclitem[],true),
 ('null_owner_default',NULL::aclitem[],acldefault('r','postgres'::regrole::oid),true),
 ('empty_is_not_default','{}'::aclitem[],NULL::aclitem[],false),
 ('privilege_change',ARRAY['anon=r/postgres']::aclitem[],ARRAY['anon=w/postgres']::aclitem[],false),
 ('grant_option_change',ARRAY['anon=r/postgres']::aclitem[],ARRAY['anon=r*/postgres']::aclitem[],false),
 ('grantor_change',ARRAY['anon=r/postgres']::aclitem[],ARRAY['anon=r/supabase_admin']::aclitem[],false),
 ('grantee_change',ARRAY['anon=r/postgres']::aclitem[],ARRAY['authenticated=r/postgres']::aclitem[],false)
) SELECT jsonb_build_object('name',name,'passed',((${canonicalAclSql("left_acl", "acldefault('r','postgres'::regrole::oid)")})=(${canonicalAclSql("right_acl", "acldefault('r','postgres'::regrole::oid)")}))=equivalent) FROM cases;
COMMIT;`;

// Bounded catalog descriptors for investigating a fingerprint mismatch. Column
// defaults and function bodies remain hashes; no application row data is read.
export const schemaDiagnosticSql = `BEGIN READ ONLY; SET LOCAL search_path=pg_catalog,public;
WITH objects AS (
 SELECT 'relation'::text kind,(n.nspname::text||'.'||c.relname::text)::text name,jsonb_build_object('kind',c.relkind,'rls',c.relrowsecurity,'forceRls',c.relforcerowsecurity,'replicaIdentity',c.relreplident,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'defaultAcl',acldefault(CASE WHEN c.relkind='S' THEN 's'::"char" ELSE 'r'::"char" END,c.relowner)::text,'viewSha256',CASE WHEN c.relkind IN ('v','m') THEN encode(extensions.digest(pg_get_viewdef(c.oid,true),'sha256'),'hex') END) details FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN (${schemaList}) AND c.relkind IN ('r','p','v','m','S')
 UNION ALL SELECT 'column',n.nspname::text||'.'||c.relname::text||'.'||a.attname::text,jsonb_build_object('physicalPosition',a.attnum,'logicalPosition',row_number() OVER(PARTITION BY c.oid ORDER BY a.attnum),'type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'defaultSha256',encode(extensions.digest(pg_get_expr(d.adbin,d.adrelid),'sha256'),'hex')) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname IN (${schemaList}) AND c.relkind IN ('r','p','v','m') AND a.attnum>0 AND NOT a.attisdropped
 UNION ALL SELECT 'function',n.nspname::text||'.'||p.proname::text||'('||pg_get_function_identity_arguments(p.oid)||')',jsonb_build_object('owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'defaultAcl',acldefault('f',p.proowner)::text,'definitionSha256',encode(extensions.digest(pg_get_functiondef(p.oid),'sha256'),'hex')) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN (${schemaList}) AND p.prokind IN ('f','p','w')
) SELECT jsonb_build_object('kind',kind,'name',name,'details',details) FROM objects ORDER BY kind,name; COMMIT;`;
