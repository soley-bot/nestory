# Ordinary staff isolation: production 164b2cf

Exact source baseline: `164b2cf93a4974bed2ae2fe5b030263dc0efc953`. Isolated local branch: `local/staff-isolation-164b2cf`. No production application, permission catalog, grant, RLS, membership, migration or customer data changes. No merge/deployment. Existing task10 work and the deposit keeper are untouched.

## Executed application coverage

137 tests across seven suites pass. The new membership suite contributes 32 cases: two companies × two branches × five daily-work permission profiles (20), plus three failed scoped lookups per company/branch (12). The other 105 cases are prior task10 fixtures rerun against this exact production source rather than their historical checkout. These are mocked application boundary checks, not database/HTTP authorization proofs.

| Surface | Allow evidence | Denial evidence | Result |
| --- | --- | --- | --- |
| Record operator, C1/C2, A/B | Existing Property/People writes and Lease preparation resolve | Unrelated Publish absent; role/access administration absent | Unit passed |
| Finance recorder, C1/C2, A/B | Payment recording resolves | Expense approval absent; report/export projection absent without Publish | Unit passed |
| Maintenance executor, C1/C2, A/B | Complete permission resolves | Review absent; evidence/archive controls remain unavailable | Unit passed |
| Report publisher, C1/C2, A/B | Publish/report capability resolves | Finance correction absent | Unit passed |
| Record reader, C1/C2, A/B | Lease/Property/People/finance read keys resolve | Change terms and report publication absent | Unit passed |
| Membership resolution | One assigned branch; exact organization slug and company filters on state/branch/role/permissions | Foreign-ID scoped lookup rejection returns no membership | Unit passed; database rejection mocked |
| Shared A+B Person | Person ID is carried in membership | Person relationships are not queried to widen user scope | Unit passed; SQL relation fixture passed |
| Deposits | Existing Change terms guard; authorized company used for record/reverse RPCs | Missing permission prevents client creation; linked-ID rejection propagated | 6 unit cases passed |
| Maintenance archive/restore | No ordinary application grant introduced | SuperAdmin guard runs before guessed case/client resolution | 2 unit cases passed |
| PDF/Excel export | Authorized company and selected Property forwarded | Forged company, denied membership, unknown artifacts; no byte loader after denial | 36 unit cases passed across two suites |
| Commercial/owner artifacts | Own authorized metadata precedes matching bytes | Denied/missing metadata blocks Storage; size/hash mismatch rejects bytes | 32 unit cases passed |
| Catalog independence | Each existing key plus its normalized domain View | No unrelated operations; proposed new granular keys rejected | 29 unit cases passed |

## Verified database matrix

`supabase/tests/staff_two_company_branch_isolation_test.sql` contains 142 assertions inside BEGIN/ROLLBACK, all passed. Exactly two fictional companies each have branches A and B, an ordinary writer and reader per branch, and an explicitly shared Person with A+B relationships. No fake A+B user is substituted for the current scalar membership model.

| Operation | Own company/assigned branch | Sibling branch | Foreign company |
| --- | --- | --- | --- |
| Property read/direct IDs | Exact one-row scope | Known ID hidden | Known ID hidden |
| Unit linked join | Exact one-row parent scope | No expanded join scope | No expanded join scope |
| Person read | Own Person and explicitly shared Person | Shared Person does not grant second-branch membership | Excluded from exact count |
| Unit create | Writer allowed, reader denied | Denied | Denied |
| Unit edit | Writer allowed with persisted value | Parent move denial exercised by supporting core suite (passed) | Foreign-parent move denied; original parent verified |
| Unit archive/restore | Writer allowed with persisted lifecycle; reader archive denied | Supporting core suite passed | Existing queued core suite |
| Raw Unit INSERT/UPDATE/DELETE | Denied for every ordinary actor | No raw authority added | No raw authority added |
| Ordinary A+B | Duplicate membership rejected; branch_id remains uuid | Product not implemented | No cross-company membership implied |

The DB-only run completed against the empty synthetic snapshot plus the exact baseline's missing migration, 20261005003645 (SHA256 0b41de91f911f4de40063509e2c09057bba6b538f2dff8ef44855b18a70f207d). Normalized public/app_private relation ACLs and RLS flags match the snapshot before assertions. This proves cloned relation permission equivalence, not complete hosted production schema identity. Ordinary assertions SET ROLE authenticated; fixture setup/state attestations use local PostgreSQL authority.

| SQL suite | Passed | Failed | Setup-blocked |
| --- | ---: | ---: | --- |
| New two-company A/B matrix | 142 | 0 | No |
| Custom-role domain authority | 75 | 0 | No |
| Core domain mutation authority | 54 | 0 | No |
| Remaining core mutation authority | 58 | 0 | No |
| Remaining branch scope/domain enforcement | 61 | 0 | No |
| Scoped lease/finance read context | 75 | 0 | No |
| Lease authority contract | 20 | 0 | No |
| Granular finance operation authority | 23 | 0 | No |
| Maintenance role workflow | 0 | 0 | Yes: required fixture user 00000000-0000-0000-0000-000000000101 absent; created_by FK fails before assertions |
| Total executed SQL assertions | 508 | 0 | One suite |

## Verification status and resource limits

- Passed: 137/137 application unit cases; 508/508 executed SQL assertions; focused ESLint with zero warnings; runner syntax; diff whitespace and reverse patch check. No ordinary application regression or cross-company/branch leak was observed in these executed checks.
- Type verification: two new fixture calls missing userId were corrected. The requested full rerun with a bounded 768 MiB heap aborted at the heap limit. Type check is resource-blocked, not passed; no larger retry was attempted.
- Corrected harness flaws: the first clone retained broad cached-image default grants, giving 44 invalid ACL/DML assertion failures (16 in the new matrix). Read-only source inspection showed authenticated raw Unit DML and anonymous reads were actually denied. The harness now removes image defaults only in its new clone and verifies normalized source-equivalent relation grants/RLS before tests. A second strict string-order comparison stopped before assertions; canonical privilege comparison eliminated ordering differences. Initial evidence is retained and is not counted as a production failure.
- Resource guard passed: at least 2 GiB free RAM before creating one new 768 MiB container; no published ports, no browser/build. Final project nestory-staff-task10-1791205168726 completed at 2026-10-05T12:59:59.551Z. Exact container/network cleanup was independently verified; image has no declared anonymous volumes. Snapshot/shared services and deposit keeper remained untouched.
- Not run: maintenance suite's 110 planned assertions; actual authenticated HTTP/Storage/generated export-content acceptance on this revision; ordinary A+B; production browser/build/CI, merge and deployment. Historical October 4 full-stack passes are not counted as this revision's passes.

Machine-readable results are tests/staff-isolation/evidence.json and unit-results.json. Reproduce small tests with node node_modules/vitest/vitest.mjs run tests/staff-isolation --maxWorkers=1. The DB runner node tests/staff-isolation/run-database.mjs requires the coordinator's exclusive slot and successful resource/approval guards; it removes only its own labelled container/network. It returns nonzero for failures or setup-blocked suites even if psql itself exits zero for failed pgTAP assertions. Never reset shared sources, seed shared SQL or stop the keeper.

## Material findings and minimum decisions

No new production application failure or company-binding regression was found in the executed scope. The two-company A/B SQL scope passed; this is not platform-wide or hosted-production leak clearance. Current maintenance application controls require SuperAdmin for archive/restore, while migration `20260822071638` rewrites the RPC predicate toward maintenance.create_assign. The earlier task10 database run found an internal-helper EXECUTE failure; that specific maintenance lifecycle failure has not been reproduced in this run because the broader workflow fixture setup was blocked. Aligning its authority is not an authorized ordinary code fix.

Before real staff conversion, supply each staff member's existing permission keys and one assigned branch (A or B). If anyone needs A+B, explicitly decide uniform versus branch-specific role permissions, combined report/export scope, and partial revocation/inactive-branch behavior; current code cannot assign both.

Only job-required authority gaps need additional choices: (1) evidence upload/lifecycle and maintenance archive delegation by executor/coordinator/reviewer; (2) whether receipt, retention, refund and reversal should remain bundled with Change terms or require independent finance authority; (3) whether report read/export should remain bundled with official Publish; (4) whether restricted People editors may alter a shared identity used outside their branch and who may create/remove branch links. These choices remain unanswered. No proposed key, permission grant, preset, migration or real assignment is implemented here.
