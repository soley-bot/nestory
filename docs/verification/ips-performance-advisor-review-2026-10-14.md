# IPS performance advisor review — 2026-10-14

This is a separate follow-up review, not clearance for the current financial
release. No index or policy has been changed. Following the coordinator's
explicit GO, local catalog reads and five plain EXPLAIN statements completed
against the isolated 211-migration candidate. No EXPLAIN ANALYZE, hosted write,
local database mutation or notification was performed for this review.

## Evidence and disposition

The initial coordinator-provided read-only hosted advisor observation is timestamped
`2026-10-14T13:45:30.215Z`. The sanitized warning details are retained privately
in `.codex-artifacts/performance-advisor-findings-20261014.json`. Its file header
rounds the observation to 13:46 UTC; the per-finding timestamp above is the source
timestamp. That initial observation predates the deposit release.

A fresh, independently requested read-only performance advisor result at
`2026-10-14T14:20:55.600Z` is retained in
`.codex-artifacts/performance-advisor-post-deposit-20261014.json`. It follows the
coordinator-verified deposit release at
`eaf3fa8327d2e93df11244e06cdb4f4b93f3d25b`, with hosted migration ledger 208.
The release SHA/ledger assertion is coordinator evidence; this refresh independently
verifies advisor findings. This is the **post-deposit, pre-PR231 baseline**, not
the final post-PR231 baseline.

| Finding | Observed count | Current disposition |
| --- | ---: | --- |
| Multiple permissive policies, WARN | 13 | Exact table/policy groups mapped below. Preserve each existing permission predicate; no policy deletion approved. |
| Duplicate index, WARN | 1 pair | Source and local catalog definitions match, with no dependency blocker. Five baseline plans captured; representative-volume before/after proof remains pending. |
| Unindexed foreign keys, INFO | 359 | Increased from 335 (+24). Fresh artifact retains all 359 named constraints and advisor column ordinals; covering-index analysis and workload evidence remain pending. No blanket index creation. |
| Unused indexes, INFO | 87 | Increased from 85 (+2). Fresh artifact retains all 87 findings; observation/reset window and workload evidence remain missing. No index removal based only on this count. |
| Absolute Auth database connections, INFO | 1 | Capacity/configuration decision; not addressed by index or RLS changes. No service or connection-setting change proposed here. |

These performance findings are separate from the security advisories being
handled by the security owner. Counts are not a measurement of query latency.
All 14 WARN findings match the initial observation exactly after normalizing
Markdown escaping: the same thirteen policy groups and the same duplicate pair.
The absolute Auth connections INFO count remains one; the service-setting
decision belongs to the security/configuration owner. The observed count changes
do not establish runtime regression or identify a necessary index change.

The local target was independently checked before database access: Docker
context `desktop-linux`, endpoint
`npipe:////./pipe/dockerDesktopLinuxEngine`, container
`b321d8ad45948b4166257dc505adf1c545b08382e6c4389cf82bb1d4456bf5d8`, name
`supabase_db_nestory-ips-readiness-20261014`, both project labels equal to
`nestory-ips-readiness-20261014`, running state, and published database port
`59322`. No Docker endpoint overrides were present. Commands pinned that exact
local endpoint and container ID and used `psql --no-psqlrc -U postgres -d postgres
-v ON_ERROR_STOP=1`. Each database session used a READ ONLY transaction,
five-second statement timeout, one-second lock timeout and final ROLLBACK.
The catalog observation at `2026-10-14T13:53:49.978414Z` reported PostgreSQL
`17.6`, database `postgres` and 211 migration-ledger entries. This local evidence
does not establish hosted schema parity or a post-release baseline.

## Post-deposit deployment and runtime baseline

Read-only Vercel metadata collected between 14:20 and 14:24 UTC is retained in
`.codex-artifacts/vercel-post-deposit-baseline-20261014.json` with an explicit
field allowlist; no environment or protection-bypass values are retained.
The project is `prj_jQnruwZcvxh1jAA8mJHDpgdSy6CD` in team
`team_Je5M9yfKfOgCSz04aZplYBbU`.

| Current alias | Deployment / SHA | Direct alias metadata |
| --- | --- | --- |
| `nestory-kh.com` | `dpl_Avj9QeQX2CBwLNfCUkrZCqwNkNRS` / `eaf3fa8327d2e93df11244e06cdb4f4b93f3d25b` | Updated 14:10:22.882 UTC; 308 redirect to www. |
| `www.nestory-kh.com` | Same deposit deployment / SHA | Updated 14:10:22.861 UTC; no redirect. |
| `nestory-soley-bots-projects.vercel.app` | `dpl_7dyGPexCqXUA95vDRE2VyqqGv9iC` / `5e16fb1a57b0dc1af284ffb87ef2fe602a80a51e` | Still points to the older deployment; do not use it as the custom-domain release identity. |

The deposit deployment is READY, target `production`, region `sin1`. Direct
alias records establish current assignment; historical deployment alias arrays
were not used as that proof. The retained deployment
`dpl_4wrFdsguMVoHuh5rqM2YATWx86rD`, SHA
`555e64905631b7fadaa6bb954c0590165b2dffb2`, is also READY in `sin1`.

The connector's rollback-list request returned 403, including after adding the
verified team scope. Its documented read-only CLI fallback succeeded with the
existing CLI credentials and exact project/team endpoint. The resulting metadata
marks both the current deposit deployment and retained 555e6490 deployment
`isRollbackCandidate=true`. No rollback was requested. This establishes retained
candidate availability, not mixed app/schema compatibility or rehearsed recovery.

A production runtime-log count query scoped to the deposit deployment, grouped
only by level over the previous 30 minutes, returned no groups. No raw request
logs or payloads were collected. Empty counts do not prove runtime health,
traffic coverage, instrumentation ingestion or alert delivery. Monitoring and
rollback acceptance therefore still require their separate operational evidence.

## Duplicate lease index

`supabase/migrations/20260808235616_operational_schema_baseline.sql` contains:

```sql
-- line 29332
CREATE INDEX "leases_org_primary_tenant_person_id_idx"
ON "public"."leases" USING "btree"
("organization_id", "primary_tenant_person_id")
WHERE ("primary_tenant_person_id" IS NOT NULL);

-- line 29340
CREATE INDEX "leases_primary_tenant_person_fk_idx"
ON "public"."leases" USING "btree"
("organization_id", "primary_tenant_person_id")
WHERE ("primary_tenant_person_id" IS NOT NULL);
```

Both are ordinary, nonunique indexes with the same key order and partial
predicate. A source search across migrations, application code, scripts, tests,
documentation and workflows found no other reference to either exact index
name. The related `leases_primary_tenant_person_fk` at baseline line 31311 is a
foreign key from `(organization_id, primary_tenant_person_id)` to
`people(organization_id, id)`, with `ON DELETE SET NULL (primary_tenant_person_id)`.
It is not a uniqueness constraint backed by either child-side index.

The narrow candidate is to retain `leases_org_primary_tenant_person_id_idx` and
remove only `leases_primary_tenant_person_fk_idx` in a new reviewed forward
migration, **after** verifying the conditions below. This is a recommendation,
not an executed fix or permission to edit the released baseline.

Required catalog proof: both names resolve to ordinary indexes on the same
`public.leases` table; both are valid, ready and live; their access method, key
attributes, included columns, expressions, predicate, collations, operator
classes, ordering/null options and storage options match. Neither removal target
may own a constraint, be replica identity or a clustered index, belong to an
extension, or have an unexpected dependent object. Retain the healthy index if
one member is invalid; do not blindly follow the preferred name.

That catalog proof passed locally. Both indexes have `relkind=i`, access method
`btree`, `indnatts=indnkeyatts=2`, `indkey='2 14'`,
`indclass='10065 10065'`, `indcollation='0 0'`, `indoption='0 0'`,
tablespace `0`, no storage options, no expressions and the identical predicate
`(primary_tenant_person_id IS NOT NULL)`. Both are nonunique, immediate, valid,
ready and live; neither is primary, exclusion, clustered, replica identity or
NULLS NOT DISTINCT. Their definitions differ only in the index name.

The constraint query returned no constraint backed by either index. The
dependency query returned only three automatic column dependencies per index:
`organization_id` once and `primary_tenant_person_id` twice (key and predicate).
There were no incoming dependent objects or extension membership dependencies.
The related foreign key's `conindid` is `people_organization_id_id_key`, confirming
that its referenced uniqueness does not depend on either lease index.

Capture these read-only descriptors only in the explicitly verified local
target, with bounded execution:

```sql
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '5s';
SET LOCAL lock_timeout = '1s';

SELECT current_database(), current_setting('server_version'),
       statement_timestamp() AS observed_at;

SELECT i.indexrelid::regclass AS index_name,
       i.indrelid::regclass AS table_name, a.amname,
       i.indnatts, i.indnkeyatts, i.indkey::text, i.indclass::text,
       i.indcollation::text, i.indoption::text,
       i.indisunique, i.indnullsnotdistinct, i.indisprimary,
       i.indisexclusion, i.indimmediate, i.indisvalid, i.indisready,
       i.indislive, i.indisclustered, i.indisreplident,
       c.relkind, c.reltablespace, c.reloptions,
       pg_get_expr(i.indexprs, i.indrelid) AS expressions,
       pg_get_expr(i.indpred, i.indrelid) AS predicate,
       pg_get_indexdef(i.indexrelid) AS definition
FROM pg_index AS i
JOIN pg_class AS c ON c.oid = i.indexrelid
JOIN pg_am AS a ON a.oid = c.relam
WHERE i.indexrelid IN (
  to_regclass('public.leases_org_primary_tenant_person_id_idx'),
  to_regclass('public.leases_primary_tenant_person_fk_idx')
)
ORDER BY i.indexrelid::regclass::text;

SELECT conname, contype, conrelid::regclass, conindid::regclass
FROM pg_constraint
WHERE conindid IN (
  to_regclass('public.leases_org_primary_tenant_person_id_idx'),
  to_regclass('public.leases_primary_tenant_person_fk_idx')
);

SELECT d.deptype,
       pg_describe_object(d.classid, d.objid, d.objsubid) AS dependent,
       pg_describe_object(d.refclassid, d.refobjid, d.refobjsubid) AS referenced
FROM pg_depend AS d
WHERE (d.refclassid = 'pg_class'::regclass AND d.refobjid IN (
  to_regclass('public.leases_org_primary_tenant_person_id_idx'),
  to_regclass('public.leases_primary_tenant_person_fk_idx')
)) OR (d.classid = 'pg_class'::regclass AND d.objid IN (
  to_regclass('public.leases_org_primary_tenant_person_id_idx'),
  to_regclass('public.leases_primary_tenant_person_fk_idx')
));

ROLLBACK;
```

Next compare a representative fictional tenant lease lookup plan before and
after the proposed change in a separately owned disposable candidate database.
Use the ordinary authenticated role and organization/branch claims. Include
matching and absent tenant IDs and retain the null-primary-tenant rejection
case: the current column is NOT NULL, as verified in `pg_attribute`. Do not
change that constraint to populate a test. Retain result equality, plan shape,
actual row counts, buffer use and timing with fixture size and cache conditions.
Do not disable sequential scans to force a favorable plan. The current source
proof supports duplicate maintenance/storage removal; it does not quantify a
read-latency improvement.

### Executed baseline plans

At `2026-10-14T13:54:41.060326Z`, the five plain plans below completed under
`SET LOCAL ROLE authenticated`, JWT subject
`00000000-0000-0000-0000-000000000701` (the fictional finance-manager fixture)
and JWT role `authenticated`. Organization, tenant, property and actor IDs come
from `supabase/test-fixtures/baseline.sql`; branch authority is derived from the
fixture membership by the existing RLS helpers. Sequential, index and bitmap
scans remained enabled. No query was executed for actual rows or timing.

| Query predicate / shape | Observed baseline plan | Estimated total cost / output rows |
| --- | --- | --- |
| Lease organization plus fixture tenant `80000000-0000-0000-0000-000000000001` | Sequential scan, retaining lease-view OR finance-property RLS filter | 3.57 / 1 |
| Same lease query, absent synthetic tenant `80000000-0000-0000-0000-000000009999` | Same sequential scan and RLS filter | 3.57 / 1 |
| Same organization, primary tenant IS NULL | Result with one-time filter `false` | 0.00 / 0 |
| Property organization plus fixture property `10000000-0000-0000-0000-000000000001` | Sequential scan, retaining property-view OR organization-admin filter | 3.06 / 1 |
| Rent exceptions for fixture organization, LIMIT 50 | Limit over sequential scan, retaining property/payment authority OR finance subplan | 4.86 / 1 |

All five select only `id` and use organization
`00000000-0000-0000-0000-000000000001`. The exact lease plan query template is:

```sql
SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000701';
SET LOCAL request.jwt.claim.role = 'authenticated';
SET LOCAL ROLE authenticated;
EXPLAIN (COSTS ON, VERBOSE OFF, FORMAT JSON)
SELECT id FROM public.leases
WHERE organization_id = '00000000-0000-0000-0000-000000000001'::uuid
  AND primary_tenant_person_id = '80000000-0000-0000-0000-000000000001'::uuid;
```

These are small-fixture plans: `pg_class.reltuples` estimates were 5 leases,
4 properties and 5 rent exceptions, each one page; the statistics view reported
no manual or automatic analyze timestamp. Estimated costs are planner units,
not milliseconds. Neither duplicate index was selected by these baseline
plans, so they do not prove which index a realistic-volume workload will use,
post-removal plan equivalence, runtime improvement or actual RLS row outcomes.

Advisor-supplied remediation:
[duplicate index](https://supabase.com/docs/guides/database/database-linter?lint=0009_duplicate_index).

## The 13 overlapping policy groups

Every reported group is `public`, role `authenticated`, action `SELECT`.
All names below are taken from the sanitized observation. The source references
identify their predicate authority, not proof of current hosted SQL equality.

The current local catalog confirms every listed pair, including the ten ALL +
SELECT and three SELECT + SELECT shapes. There are 28 policies across the
thirteen tables: the 26 listed policies plus the existing organizations UPDATE
and DELETE policies. All 28 are permissive and apply to `authenticated`.
All thirteen tables have RLS enabled and FORCE RLS disabled. Their direct
`authenticated` table grants are SELECT only; no anonymous table grant was
present in the captured ACLs. Preserve those grants: splitting an ALL policy
must not introduce direct client write access. Existing RPC write-authority
tests are still needed alongside direct-write denial checks.

| Table | Reported policies | Shape and source |
| --- | --- | --- |
| `asset_photos` | `Admins can manage asset photos`; `Authorized users can read asset photos` | ALL + SELECT. Baseline 32349; branch-scope migration `20260822041743`, 429. |
| `lease_deposit_events` | `Admins can manage lease deposit events`; `Finance roles can read records` | ALL + SELECT. Baseline 32397 and 32541. |
| `lease_deposits` | `Admins can manage lease deposits`; `Finance roles can read records` | ALL + SELECT. Baseline 32401 and 32545. |
| `organization_branches` | `Admins can manage branches`; `Authorized users can read branches` | ALL + SELECT. Baseline 32353; branch-scope migration 459. |
| `organization_members` | `Admins can read organization memberships`; `Authorized users can read own membership` | SELECT + SELECT. Baseline 32473; branch-scope migration 467. |
| `organizations` | `Admins can read organizations`; `Authorized users can read organizations` | SELECT + SELECT. Baseline 32477; branch-scope migration 451. |
| `people` | `Admins can manage people`; `Authorized users can read people` | ALL + SELECT. Baseline 32409; core mutation migration `20260822045638`, 462. |
| `person_roles` | `Admins can manage person roles`; `Authorized users can read person roles` | ALL + SELECT. Baseline 32417; core mutation migration 470. |
| `petty_cash_accounts` | `Admins can manage petty cash accounts`; `Finance roles can read records` | ALL + SELECT. Baseline 32421 and 32597. |
| `petty_cash_periods` | `Admins can manage petty cash periods`; `Finance roles can read records` | ALL + SELECT. Baseline 32429 and 32605. |
| `properties` | `Admins can manage properties`; `Authorized users can read properties` | ALL + SELECT. Baseline 32433; branch-scope migration 405. |
| `rent_generation_exceptions` | `Finance roles can read rent generation exceptions`; `rent_generation_exceptions_branch_select` | SELECT + SELECT. Baseline 32633; remaining branch-scope migration `20260822071638`, 3257. |
| `units` | `Admins can manage units`; `Authorized users can read units` | ALL + SELECT. Baseline 32457; branch-scope migration 417. |

Applicable permissive policies combine with logical OR. An ALL policy also
participates in SELECT and write checks; SELECT visibility affects writes that
read or return rows. Therefore deleting an apparently overlapping admin or
branch policy can change authorization. These semantics are documented in
[PostgreSQL17 CREATE POLICY](https://www.postgresql.org/docs/17/sql-createpolicy.html).

A behavior-preserving consolidation, if approved after catalog verification,
would keep one SELECT policy containing the exact parenthesized `A OR B` from
the existing two SELECT predicates. For each of the ten ALL + SELECT groups,
replace the old ALL policy with explicit INSERT, UPDATE and DELETE policies
retaining its exact `WITH CHECK`/`USING` predicates and roles. The new SELECT
policy preserves the original ALL predicate as one OR arm. For the three
SELECT-only groups, merge only those SELECT predicates. Preserve all other
policies, restrictive checks, RLS flags, grants, helpers and search-path rules.

In particular, the rent-exception policies use different authorities:
`can_read_finance(organization_id)` versus a resolved lease property checked with
`finance.record_payments`. Neither predicate may simply replace the other.
Likewise, asset-photo visibility includes a unit/property consistency check, and
own-membership visibility includes both the current user and an active branch.

Before preparing migration SQL, capture all policies for these thirteen tables
from `pg_policies`/`pg_policy`, including permissive/restrictive type, roles,
command, `qual` and `with_check`, plus RLS flags and relevant table grants. Reject
unexpected policy sets instead of applying a broad generated rewrite. Test
before/after row visibility and permitted/denied writes with legacy admins,
custom roles, finance and maintenance users, no active branch, other branches,
other companies and anonymous sessions. Include INSERT/UPDATE RETURNING and
conflict-handling paths where the product uses them. Database access for these
tests must use the coordinator's disposable fictional target.

The local catalog capture included every policy's `qual` and `with_check`,
permissiveness, roles and command plus each table's `relrowsecurity`,
`relforcerowsecurity` and complete ACL. The ten ALL policies each use
`app_private.is_org_admin(organization_id)` for both USING and WITH CHECK;
the SELECT policies have no WITH CHECK. Distinctive predicates were preserved
in the captured output: the asset-photo unit/property EXISTS check,
own-membership `auth.uid()` and active-branch conditions, the two separate
rent-exception authority predicates, and branch visibility helpers for people
and person roles. The two extra organizations policies both use
`app_private.is_org_admin(id)`; UPDATE also uses it for WITH CHECK. A later
migration must re-read and assert this complete catalog state rather than
assuming this observation remains current.

A single OR expression may still evaluate both helpers. A clean advisor result
alone does not prove lower query cost; retain representative authenticated query
plans and row outcomes before and after consolidation. This review does not
approve a material permission change.

Advisor-supplied remediation:
[multiple permissive policies](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies).

## Informational index inventory

For each of the 359 currently reported foreign keys, obtain the exact table, ordered key
columns, referenced table, delete/update action and all existing index keys and
predicates. Rank candidates using representative joins, parent-key changes,
table sizes and actual workloads. PostgreSQL does not automatically create an
index on referencing columns; whether to add one depends on that workload.
[PostgreSQL17 foreign-key indexing](https://www.postgresql.org/docs/17/ddl-constraints.html#DDL-CONSTRAINTS-FK)

An existing composite index may cover a candidate; a partial predicate or wrong
leading column order may prevent coverage. Do not emit 359 CREATE INDEX
statements from the warning count. Propose individual indexes only after a
fictional-volume EXPLAIN/measurement shows a useful plan and the write/storage
cost is considered. Production statement text and customer rows are not needed
for the initial catalog inventory. The post-deposit artifact now supplies the
advisor's named constraint/table and column-ordinal inventory; translate those
ordinals through the target catalog and compare existing indexes before ranking
candidates. [Advisor remediation for unindexed foreign keys](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).

For each of the 87 currently reported unused indexes, retain `idx_scan`, `last_idx_scan`, size,
table write activity and the statistics observation/reset window, then inspect
constraint, replica-identity and dependency roles. Index statistics are counts
of observed scans, not proof that an index is unnecessary.
[PostgreSQL17 index statistics](https://www.postgresql.org/docs/17/monitoring-stats.html#MONITORING-PG-STAT-ALL-INDEXES-VIEW)
The fresh artifact retains each reported index identity.
[Advisor remediation for unused indexes](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

Cover daily operations and month-close/reconciliation workloads before proposing
removal. A fresh reset, infrequent recovery query or supporting integrity check
can make a useful index appear unused. Keep these proposals separate from the
proven duplicate pair.

## Next bounded action

Local identity, index equivalence/dependency, complete policy metadata and five
plain baseline-plan checks are complete. No index/policy migration was prepared
or executed. The next separately reviewed follow-up can remove the duplicate
lease index after representative-volume candidate validation and target catalog
revalidation. A policy consolidation proposal must preserve the full OR
authorization and existing write/grant behavior, then demonstrate equivalent
row visibility and permitted/denied RPC and direct-write outcomes. Hosted
parity, representative-volume before/after measurements and workload/catalog
assessment of the 359/87 informational findings remain outstanding. The deposit
release hold has been lifted by the coordinator; PR231 still requires its own
technical gates and final post-release baseline. Keep this performance follow-up
separate from those current financial release gates.
