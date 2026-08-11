# Track 4B implementation report - official Owner Statement publication

## Status and scope

Implementation and criterion self-review are complete on
`codex/ips-operational-readiness`, based on approved Track 4A head
`384cd946c8d014b6930d35a7950d9cf5ec9902ca`. Independent review is pending;
this report does not claim approval.

The delivered operator outcome is one end-to-end local publication lifecycle:
a Super Admin publishes an immutable numbered Owner Statement from a current
closed revision, downloads retained byte-verified PDF and XLSX artifacts,
reopens/recloses, and publishes N+1 explicitly superseding N while N's database
snapshot, canonical hash, artifact bytes, hashes, and paths remain unchanged.
Finance reads/downloads only. Operations is denied.

## Authority and failure recovery

CLI-generated migrations:

1. `20260810150838_owner_statement_publication.sql`
2. `20260810153022_guard_owner_statement_completion_before_reopen.sql`
3. `20260810160045_scope_owner_statement_storage_policy_check.sql`

Publication and artifact tables use RLS plus FORCE RLS, immutable checked
writes, tenant-scoped authenticated reads, explicit grants, private helpers,
and locked search paths. Statement numbers match
`OS-YYYYMM-12HEX` and contain no owner/property PII. Only a closed current
revision can publish, with at most one publication per revision.

Publication claims shared actor-bound idempotency and serializes with close
authority. A publication may temporarily exist before artifact completion only
as visible typed remediation. Reopen and superseding publication fail closed
until exactly one registered PDF and XLSX exist. Create-only retry verifies an
already uploaded object's bytes and cannot replace registered authority.

## Canonical evidence and artifacts

The canonical model consumes only the selected publication, immutable close
revision, frozen lines, and frozen source links. It rejects noncanonical money,
hashes, counts, or order and does not call live finance/property-cash loaders.
Exact money remains decimal text until renderer serialization.

PDF and XLSX share that model and are deterministic per publication. Download
routes resolve immutable metadata, fetch the retained private Storage object,
recompute SHA-256 and byte length, and refuse mismatches. The workbook has
typed money, Statement/Source Trace/Checks sheets, freeze panes, explicit units,
and no formulas. The PDF contains the statement body, source appendix, and
stable `Page 1 of 2` / `2 of 2` numbering.

The bounded bundled `@oai/artifact-tool` pass imported and inspected all three
sheets, found zero formula-error matches, and rendered every sheet. Its first
render exposed clipped Statement and Source Trace labels; a literal failing
width test preceded the focused fix. The final renders have visible labels,
headers, components, 9 lines, 9 sources, and OK checks. The tool produced all
requested JSON/PNG outputs before a Windows post-output process exit
`-1073740791`; no inspection output is missing. Poppler independently reported
a two-page A4, unencrypted, JavaScript-free PDF and rendered both legible pages;
only font-fallback warnings were emitted.

## Criterion self-review

- Immutability/numbering: one publication per revision, unique immutable paths,
  stable non-PII number, prior retention and explicit supersession are covered.
- Frozen-only authority: payload/content hash and all display/export values are
  derived from retained close evidence, never live transaction tables.
- Byte integrity: generation is byte-identical; registration and download
  verify exact hash/size; overwrite and metadata mismatch fail closed.
- Authorization/isolation: Super Admin publishes; Finance roles read/download;
  Operations, cross-tenant, unaffiliated, anonymous, and service-role paths are
  denied before target disclosure.
- Recovery/idempotency: partial publication is typed and retryable; exact replay
  returns the same IDs; conflicting actor/payload and incomplete reopen are
  atomic.
- Concurrency: duplicate publish/register and register/reopen both-start-order
  races wait without `40P01`, duplicate numbers/paths, orphan metadata, or
  pending claims.
- Artifact quality: PDF/XLSX share one canonical model, are legible, retain
  source trace, and pass type/formula/clipping inspection.
- Scope: no email, scheduling, hosted mutation, real IPS evidence, deployment,
  backup claim, or Track 5 work was added.

No known critical accounting, authorization, tenant-isolation,
evidence-integrity, idempotency, concurrency, irreversible-data, or artifact-
retention defect remains after implementer self-review.

## Browser acceptance

One exact-worktree authenticated flow completed after focused preflight:

1. Super Admin entered through visible Finance navigation, saw the retained R3
   publication and ready R4, then downloaded R3 PDF/XLSX matching DB hash/size.
2. Super Admin closed R4, published N+1, downloaded both new artifacts, and
   proved R3 marked superseded while its snapshot and both bytes were unchanged.
3. Finance Manager saw both publications and downloaded them without any
   publication/close mutation control.
4. Operations Manager had no navigation entry and received route denial.

The initial flow found that the download UUID parser rejected valid repository
fixture UUIDs; a focused 2-case RED preceded the fix, and the complete flow then
passed. Fixture restoration ran in `finally`.

## Matrix and affected correction evidence

The expensive full matrix ran once after browser acceptance. Accumulated
results:

- clean reset and guarded fixture: pass;
- complete application: 198 files, 1,477 pass and one intentional skip;
- final demo tooling 47/47; routes 47/47; role journeys 5/5;
- TypeScript, ESLint, UI copy, build, and diff checks: pass;
- database lint: zero errors with five unchanged unused-variable warnings;
- error-level advisors: zero findings;
- concurrency: readiness 13/13, opening 4/4, lifecycle 6/6, close 15/15,
  publication 4/4;
- full accessibility crawl: completed in 392.9 seconds with the unchanged 98
  cross-module backlog findings and zero changed `/balances` findings.

The matrix's one scoped database finding was a too-broad private Storage-policy
helper grant that broke the existing maintenance direct-deletion contract. The
final additive migration scopes the policy through the tenant-admin helper and
revokes anonymous/service access. Only affected gates reran: focused owner-
statement plus maintenance pgTAP 96/96, clean reset/fixture, DB lint/advisors,
TypeScript, ESLint, 19 focused application tests, two retained contracts, all
three Track 2/3/4 fixture smokes, build, and diff check passed.

The later workbook clipping correction reran only the affected Excel test
(3/3), guarded fixture artifact generation, read-only fixture reconciliation,
and PDF/XLSX inspection. No second full matrix or browser cycle is claimed.

## Residuals and handoff

The initial independent review at `bb7284d19683fd012c1e0a84c70702452febf0ab`
reported 3 Critical and 3 Important findings. One coordinated additive
correction batch now addresses all six without editing prior migrations:

- verified artifact registration is service-only and bound to the exact
  Storage object identity/version, MIME, server-downloaded hash, and length;
- partial publications resume by publication identity with a fresh actor-bound
  key, visible Super Admin remediation, create-only recovery, and registered-
  format skipping;
- XLSX ZIP timestamps are fixed across delayed and cross-timezone rendering;
- skipped unpublished revisions retain nearest-prior official supersession;
- artifact claim keys hash the complete command/publication/format tuple;
- the manual fixture asserts four exact component equations and all nine
  ordered line/source facts.

The retained real Storage proof rejects authenticated metadata registration,
wrong object version, wrong size, wrong MIME, and replacement, then independently
reproduces the accepted SHA-256 and length. Publication races remain 4/4. The
fixture cleanup itself is now guarded to loopback and removes only the fixture
organization's prior objects through the Storage API, leaving exactly two
registered files, zero unregistered files, and zero pending statement requests.

Affected correction gates passed: publication pgTAP 38/38, real Storage 1/1,
focused application 10 files/83 tests, demo tools 48/48, fixture contract 2/2,
fixture reconciliation, TypeScript, ESLint, DB lint, production build, and diff
check. Because the correction changed the server-side publish boundary, the
single four-phase authenticated browser lifecycle was rerun and passed; its
`finally` restoration returned the exact guarded baseline. The expensive full
matrix and accessibility crawl were not rerun.

The focused correction re-review accepted C1-C3 and I1-I3, then reproduced one
new Critical cleanup/registration race: a DELETE authorized while the object
was still unregistered could wait and remove it after registration committed.
The final additive migration removes all authenticated DELETE authority for the
official bucket and revokes the retired policy helper. The action now leaves an
uploaded create-only object in place after ambiguous failure so checked resume
can verify/reuse it. Retained real Storage coverage executes cleanup-first and
registration-first orderings; neither removes the object, both registrations
retain matching bytes, and the final baseline has no missing registered object,
orphan, duplicate, deadlock, or pending request. Final independent focused
re-review approved Track 4B at
`0f678b1b7469e6de9ec351dbd4faa4555327e3d6`: C4 addressed, no new
Critical/Important/Minor findings, and Track 5 open.

- Independent milestone approval: complete at `0f678b1b`.
- The 98 unrelated accessibility findings, five legacy DB-lint warnings, and
  Next.js multiple-lockfile warning remain backlog.
- Hosted Supabase/Vercel parity, email, cron, backups/recovery, real IPS data,
  and full production lifecycle evidence remain for later milestones.
- Track 5 has not started.
