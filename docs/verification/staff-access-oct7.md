# Staff access track, October 7

This records the worker handoff at `164b2cf` and its historical checks. Integration now uses released main `bd294f3c48ca22cd4367668d9c2e82c1ec120345`; references below to the latest baseline describe the worker's earlier checkpoint, not current production. The combined onboarding, maintenance and access application suites passed 355 tests, followed by 22 runner-evidence regressions. Combined full TypeScript passed with a 1536 MiB heap. The new SQL assertions remain unexecuted on this integration and require disposable CI before release.

Read-only GitHub main fetch verified `164b2cf93a4974bed2ae2fe5b030263dc0efc953`, unchanged from the prior production baseline. New isolated branch: `local/staff-access-oct7`. Prior patch SHA256 `0797be9ed5a908ce22f16ad3c1ec379e748d6e8ec06671e34b16e331d97dffb7` is preserved, reverse-verified against the prior worker tree, forward-checked and applied to this checkout. No financial application source files, real staff assignments, production grants/RLS, migrations or customer data are changed. The historical October 5 report/results remain historical, not a claim of an October 7 database rerun.

## Completed code fix and evidence

The generic document download route checked the registered SHA-256 only when content validation failed. A valid PDF changed from version 1.7 to 1.6 retained its size and structure but bypassed that fingerprint check and returned HTTP 200. The new C1/C2 × A/B tests reproduced four failures before the fix, with 20 other new cases passing. The route now checks a non-null registered hash before content validation for every supported document type. A mismatch returns the existing unavailable response, with no partial document body. The comparison uses strict null handling: only explicit null permits pre-fingerprint legacy downloads; a missing selected field fails closed for both valid and unverified bytes. The existing route fixture now supplies explicit null. Eight additional missing-field regressions cover both byte types across four scopes.

After correction: 203/203 tests passed across the staff isolation suites and the existing document-route suite; 56 are new generic-document checks, including matching/mismatched PNG/JPEG/WebP bytes. Focused ESLint passed with zero warnings. `document-download-before.json` preserves reproduction and `oct7-unit-results.json` preserves the corrected result. These are mocked route/membership/client checks using real PDF validation; they do not prove HTTP Auth sessions or Storage RLS by themselves.

## Prepared fixture and database improvements

The existing maintenance workflow suite now explicitly supplies its missing synthetic prerequisite Auth users, company, assigned branch, staff/tenant/owner identities, memberships, Property and Unit inside its rollback-only transaction. It also supplies a real synthetic foreign-company SuperAdmin membership for the foreign actor, so that denial cannot pass merely because the actor has no membership. Fixture inserts tolerate existing seed identities; no broad seed/reset or permission change is used. Its existing 110 assertions are preserved. Execution is pending a coordinated slot; these fixture edits are not yet claimed to resolve every setup error.

`staff_document_revocation_test.sql` prepares 156 rollback-only assertions over two companies and A/B branches. It uses actual authenticated SQL role/RLS checks and the same JWT subject before and after fixture-only authority changes: domain permissions removed, role archived, branch inactive, ordinary access disabled, membership removed and single-branch reassignment. Every revocation checks document metadata denial, raw Storage object metadata denial, checked-write denial and absence of mutation rows; restored fixture authority is a positive control. Known sibling/foreign document IDs and raw Storage paths are negative controls. SQL object metadata is not actual binary Storage transport.

## Current access matrix

| Surface | Allowed current scope | Denied current scope | Evidence |
| --- | --- | --- | --- |
| Ordinary daily records | One active assigned branch with existing operation keys | Sibling/foreign IDs, forbidden linked parents, raw writes | 142 SQL assertions passed October 5; latest main remains identical; rerun pending |
| Generic document bytes | Current membership company and authorized metadata; matching bytes | Hidden sibling/foreign metadata, revoked membership, valid changed bytes, provider errors | 56 new route cases passed October 7 |
| Commercial/owner artifacts and report exports | Checked metadata/report membership company and existing keys | Forged scope, denied metadata, missing permission, integrity mismatch | Existing staff test cases rerun October 7 |
| Document/Storage revocation | Restored fixture authority returns access | Same JWT after permission/role/branch/state/membership revocation | 156 SQL assertions prepared, not yet run |
| Assigned maintenance workflow | Existing completion/create/assign/review keys and actor checks | Foreign company/branch and unrelated operations | Fixture repaired locally; 110 assertions not yet rerun |
| Maintenance evidence/archive | Current application controls require SuperAdmin | Every custom catalog role | Unit guards passed; RPC/application lifecycle alignment remains a decision gate |
| Ordinary A+B | Not implemented; scalar membership only | Duplicate membership cannot simulate both | No ordinary A+B acceptance claim |

## Remaining verification and coordination

No Docker/full build/browser or full type check has started in this October 7 phase. The integration thread owns coordination of heavy-test slots. The request is recorded at `../staff-access-oct7-slot-request.md`: DB-only container up to 768 MiB with a 2 GiB startup RAM guard, followed sequentially by a full type check with an initial 1536 MiB heap only if sufficient RAM is available. Keepers and existing services are untouched. The previous 768 MiB type attempt exhausted its heap; it is not a TypeScript pass. No larger retry is inferred to succeed.

The DB runner retains its normalized source relation ACL/RLS match guard, unique resource label, empty snapshot requirement, no published ports and cleanup of only owned resources. It now includes the new revocation suite. The prior 508 SQL passes are supporting history; maintenance and revocation execution and full type checking remain pending.

## Unavoidable decisions only

Integration checkpoint: the October 7 DB-only attempt stopped before creating resources or executing SQL because the Docker Linux engine was unavailable. Independent static review then identified that the new revocation fixture supplied retained fingerprints without the existing checked document-write context. Integration brackets only those synthetic inserts with that context and clears it before every authenticated assertion. This corrects fixture setup without changing any production guard, grant or policy. All new SQL suites still require disposable CI execution; the blocked local attempt is not a pass.

The same review found that the standalone DB runner accepted exit-zero output without proving a complete test plan. Its evidence gate now requires a nonempty, single start/end plan and every numbered assertion, rejecting failures, missing/extra/duplicate assertions, skipped/TODO cases and bailouts. Focused regressions cover incomplete streams independently of Docker. This validator supports the flat pgTAP output used here; it is not a general TAP parser. Plan and bailout rules follow the [TAP specification](https://testanything.org/tap-version-13-specification.html).

The first disposable CI run on PR229 passed application checks and build, but exposed two fixture setup errors. Maintenance prerequisites now skip already-present memberships before INSERT triggers, preserving the activated custom assignments. Archived-role revocation cases first assert the existing assigned-role lifecycle guard rejects archival, then simulate the defensive legacy-state case with that one trigger disabled only around fixture setup and enabled before all access assertions. The original 156 assertions remain, with eight lifecycle-guard checks added. No production guard or permission changes. Exact corrected-head SQL CI is pending.

The optional local DB helper now bounds subprocess execution, tracks requested resources before uncertain create completion, and checks ownership before removal. Cleanup errors force a nonzero result while remaining cleanup and evidence recording continue. Five mocked failure scenarios and the 22 TAP evidence cases passed; no real Docker process or database was used for these tests.

No authority choice is required for the fingerprint fix or fixture/test repairs. Before assigning real staff, supply each staff member's existing permission keys and one branch. If A+B is required, decide uniform versus branch-specific permissions, combined exports and partial revocation/inactive-branch behavior before implementation. Only if a daily job requires the unresolved gaps, decide maintenance evidence/archive delegation, independent deposit receipt/retention/refund/reversal authority versus Change terms, report reading/export versus official Publish, and shared-Person editing/linking authority. No preset, new key or real grant is inferred from these proposals.
