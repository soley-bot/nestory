# IPS operational readiness progress

## Track 2.0 — ownership readiness prerequisite

- Status: approved by independent manual review on 2026-08-09.
- Outcome: commit `e64756e9251824b723716bb070623993eb896e05` establishes half-open ownership intervals, explicit dated shares, exact 100% roster validation, deterministic roster hashes, overlap protection, guarded importer preservation, Finance-readable remediation rows, and a read-only legacy preflight. It does not yet create opening-balance authority or alter financial projections.
- Evidence: focused ownership/import pgTAP passed 83/83; full pgTAP passed 1,103/1,103; readiness, parity, concurrency, and hosted-gate tooling passed 13/13; Vitest passed 1,312 tests with one intentional skip; demo tooling passed 29/29; database lint, TypeScript, ESLint, route coverage, UI copy, build, and migration portability passed.
- Browser evidence: not required for this explicit database prerequisite. The owner replacement/remediation action and form contracts passed focused tests; the complete authenticated Opening Owner Balance browser workflow is required before Track 2 is complete.
- Remaining limitations: approved ownership snapshots are not yet opening balances and do not affect Ledger, owner balances, withdrawals, reports, allocation, roll-forward, Owner Close, or Owner Statement. Hosted ownership preflight and remediation remain unexecuted pending explicit hosted approval.
- Next implementation task: Opening Owner Balance schema and checked workflow, beginning with request/entry authority and direct-write security.

## Release prerequisite — authenticated route discoverability

- Status: approved by independent manual review on 2026-08-09.
- Outcome: runtime/test commit `006e1641d9d4b447e0baf32844122422c474d133` inventories all 38 authenticated dashboard routes plus `/workspace`, fixes role/guard/navigation parity and finance dead ends, and adds shell/context-relative browser coverage. Evidence-only commit `ee38d94a299e300cc69a2c03f316a05bfc5e8bdc` contains the generated matrix and reports.
- Browser evidence: exact runtime commit `006e1641d9d4b447e0baf32844122422c474d133` passed five role session starts from `/workspace`, 66/66 visible-link journeys, 71/71 forbidden-global-link absence checks, four separate direct denials, and legacy role smoke 5/5. Independent final-HEAD production build and browser rerun also passed.
- Regression evidence: Vitest passed 1,316 tests with one existing skip; tooling passed 36/36; UI route coverage passed 47/47; the authenticated route verifier passed 38/38; focused reviewer checks passed Node 9/9 and Vitest 83/83; TypeScript, ESLint, dependency resolution, diff checks, and listener cleanup passed.
- Remaining limitations: capability-to-role sets are duplicated in the verifier and require future drift monitoring. Browser denial probes are representative, while all route-role denials are documented and statically checked. Hosted Supabase, Vercel, email, cron, real IPS data, and production recovery remain unverified and unchanged.
- Next implementation task: every Opening Owner Balance page and action must be reachable from the approved Finance/Settings navigation contract and completed through visible links; direct destination URLs will not count as acceptance evidence.

## Track 2 Task 2.3B correction milestone — opening authority and evidence UI

- Status: approved by independent manual review on 2026-08-10 at commit `5655a8d86132177c3d8ec68e7d0c9047e6b54109`. This is not hosted or production approval.
- Outcome: the default queue is seeded only from authoritative effective-dated property-owner assignments with valid unarchived property, person, owner-role, and exact-100% roster facts. Every real assignment receives exactly four opening components; invalid rosters remain visible as remediation state and receive no submit controls. Exact filters cannot fabricate property-owner pairs.
- Workflow and recovery: only the newest request drives status, evidence, ownership, and actions. A rejected leaf exposes only Resubmit, a clean Unknown exposes only Submit, and a submitted successor exposes only review/awaiting-review behavior. Successful actions announce through a persistent page status and receive focus; domain and network failures retain amount, reason, source, evidence, fingerprint, and idempotency key.
- Evidence integrity: evidence bytes remain client-local until final submit. The final server action verifies bytes and immutable metadata, uploads with no overwrite to a deterministic actor/organization/idempotency-bound path, and calls a locked SECURITY DEFINER wrapper that registers the document and opening request atomically. Exact retries verify object bytes and metadata; Storage cleanup is restricted to a newly uploaded unregistered loser and remains guarded by the document/reference lock. Cancel and failed database submission leave no new document/request artifact; success leaves one immutable referenced object/document; both cleanup-first and wrapper-first races are covered.
- Responsive/accessibility evidence: `/balances` passed four local viewport captures, five role checks, serious/critical axe checks, and an automated 720x450 keyboard traversal with actual root text scaled from 16px to 32px. The 390px view preserves a labelled focusable opening-authority table scroller (390px client width, 1120px scroll width), while filters and controls wrap to full rows at 200% large text. Corrected screenshots and the browser/role/axe summary are stored outside the repository under `C:\Users\USer\.codex\visualizations\2026\08\10\track2-3b-correction`.
- Verification: clean local migration reset and fixture load passed; database lint and error-level advisors returned no findings; all 37 pgTAP files passed 1,361 assertions. Owner workflow concurrency passed 4/4 and document/storage lifecycle concurrency passed 6/6, including both cleanup/reference start orders. Vitest passed 1,422 tests with one existing intentional skip and demo tooling passed 37/37. TypeScript, ESLint, generated database types, build, 47/47 route coverage, UI copy, 38/38 authenticated route discoverability, and five fixture role journeys passed.
- Scope boundary: no hosted Supabase or Vercel operation, real IPS data access, push, merge, deploy, Track 3, Owner Close, or Owner Statement change was performed.

## Track 2 Task 2.4 — guarded owner-opening fixture and authenticated acceptance

- Status: approved by focused independent re-review on 2026-08-10 at correction commit `7c7f610efd6a440e51d6bc46e18432aafc00c7bb`. The original two Major and one Minor findings are all addressed, with no new Critical or Important breakage. This is local milestone approval, not hosted or production approval.
- Fixture outcome: the guarded local-only baseline now creates Central Residence opening authority solely through the checked public submit/review/correction RPCs over its explicit 100.000% effective-dated owner roster. It covers all four components at `1250.00`, authoritative `0.00`, `240.50`, and `800.00`; rejected initial and correction leaves each have one linked successor; a separate deposit correction remains submitted for independent review. The approved zero correction targets the current `0.00` entry and writes a literal `0.00` reversal plus `0.00` replacement.
- Integrity and reconciliation: all three fixture ownership assignments pin `started_on` to `2024-01-01`. All eight requests and six entries are matched by natural key to the exact property-owner/share/roster identities, and the Central Residence roster hash `79fda8768211db83193d4eb3f8549f959b8331a729eaf83aa681add682d94262` is recomputed from the full canonical owner/share/date input. Runtime request, idempotency, and activity hashes are recomputed from canonical public payloads and compared exactly; generated IDs remain present for that proof but are normalized to natural references for the month-stable semantic manifest hash `1f28cceda852baeebe7878edf71ec09375ebb7d2958e572cc047f73b955fc4b0`. `CURRENT_MONTH` normalization is separately guarded by exact current-business-month assertions for every request, entry, and authority row. No document row or physical Storage object is created, and no projection, Track 3 allocation, Owner Close, or Owner Statement authority is inferred.
- Contract evidence: `owner_opening_balance_reconciliation_test.sql` now passes 36 assertions and includes the pinned roster dates plus exact per-row request, entry, and transition oracles. The hermetic owner-opening Node contract passes 5/5, the shared explicit-container selector passes 4/4, and complete demo tooling passes 44/44 with both an unavailable database target and an unreachable Docker endpoint. The prior expensive 38-file/full-application matrix at `8614c7e3` remains historical evidence and was not rerun or claimed for the correction batch.
- Authenticated browser evidence: before reset the harness verifies one configured local database target, passes that same target to the loader, and reuses it for all DB assertions and cleanup; an unavailable explicit target fails before reset. The exact-worktree acceptance then proves that equal `submitted_at` fixture timestamps cannot let UUID order choose Current, starts each actor at `/workspace`, enters through `Open workspace`, and reaches Owner balances only through visible Finance navigation for the submit/approve/correct/reject/resubmit/approve zero journey. Persistent success status and focus, authoritative database effects, denied Operations controls, and deterministic cleanup all pass.
- Verification report: see `docs/verification/track-2-4-owner-opening-fixture-acceptance.md`.
- Full-gate residual: the corrected production `/balances` axe gate is green across four viewports and five roles. The exact-checkout legacy full-app `test:ui-a11y` rerun remains non-green with the same 98 cross-module findings: 92 color-contrast route/viewport findings across 27 non-Balances routes including four Maintenance-board captures, two non-focusable table scrollers on the property-account route at compact-desktop and phone, and four `/users-roles` React `#419` page errors. It has zero `/balances` axe or page-error findings and remains assigned to the later program-wide accessibility/release milestone.
- Scope boundary: local implementation only. No hosted Supabase/Vercel operation, email, real IPS data, push, merge, deploy, Track 3, projection, allocation, Owner Close, or Owner Statement work was performed. Owner Opening Balances is approved; Track 3 owner allocation, reversal safety, authoritative balances, and roll-forward is now unblocked.

## Track 3 - authoritative owner-balance lifecycle

- Status: locally approved by final focused independent re-review on 2026-08-10
  at `5688bafb0e9242f1ff0284a4ada7e5a8d5bc7462`. Track 4 is unblocked locally.
- Outcome: all 12 binding owner-affecting source types now resolve through one private registry into immutable allocation sets, exact roster/explicit-owner snapshots, component movements, source-consumption and reversal lineage, explicit transfer instructions, and deterministic four-component monthly periods. Unsupported, ambiguous, stale, incomplete-roster, fingerprint-drift, dependent-cash, and unresolved-transfer states fail closed with typed remediation.
- Cash and correction authority: available withdrawal derives only from authoritative IPS-held owner cash. Distribution and tenant/owner-payment/withdrawal reversals serialize on stable month/property/owner/source keys and reject exact downstream consumption. Finance Manager ordinary `canCorrectFinance` is enabled only behind those guards; transfer, exceptional correction, unlock, and closed-period authority remain Super Admin only.
- Security and idempotency: all nine new tables use RLS plus FORCE RLS, authenticated SELECT only, and complete direct-DML/anon/service-role denial. Checked RPCs use actor/organization checks, locked search paths, explicit grants, and the existing shared financial-idempotency authority with public-argument-only hashes and actor-bound replay.
- Historical fixture/browser summary at milestone commit `3bc2030`: the guarded fixture reconciled 16 literal component rows, all 12 source types, two properties, and two months. The implementation report records one real-role browser flow starting at `/workspace`, using visible navigation and checked mutations, with 11/11 summarized opening-to-roll-forward/database/denial phases and current/next browser totals of held cash `2250.25` and custody `870.00`. The correction-round evidence limitation below applies to exact-head/raw-log correlation.
- Final affected verification: clean reset through 11 CLI-generated migrations; allocation/cash 72/72, roll-forward 24/24, tenant behavior 36/36, lifecycle concurrency 6/6, focused application 78/78, finance actions 20/20, TypeScript, focused ESLint, production build, generated types, database lint with zero errors, and diff checks green.
- One full-matrix boundary: the required expensive matrix ran once after browser acceptance. Its 12 legacy pgTAP contract findings, one theme-contract finding, and real distribution Ledger parity gap were handled through affected reruns only. The unrelated `/users-roles` SSR error and 118 program-wide accessibility harness findings remain backlog; `/balances` has no axe or page-error finding in that artifact.
- Verification report: `docs/verification/track-3-owner-balance-lifecycle.md`. Full TDD, lock, source, browser, matrix, and residual evidence is in the local SDD implementation report.
- Scope boundary: local implementation only. No hosted Supabase/Vercel operation, email, real IPS data, push, merge, deploy, Owner Close, publication, PDF, or Excel work was performed.
- Independent-review correction round 1: C1-C3 and I1-I3 are fixed from base `3bc20304062b0499c759132338e1c83280d9e8d4` by CLI-generated migration `20260810091218_harden_owner_balance_lifecycle_corrections.sql`, focused database/application changes, corrected guarded fixture authority, and retained executable concurrency/security tests.
- Correction evidence: clean reset/types; correction 40/40 and live catalog/role 22/22; original allocation/cash 72/72, roll-forward 24/24, tenant 36/36, affected opening 220/220; original and correction lifecycle concurrency 6/6 each; fixture 16 rows/12 source types/2 properties/2 months; focused application 35/35; TypeScript, focused ESLint, database lint/advisors, build, and diff checks green. Corrected Central held cash is `1855.00` with owner due to IPS `0.00`.
- Evidence limitation: the retained accessibility summary exists, but no raw historical browser/full-matrix command log, explicit exit-code/head/database-identity file, or artifact-SHA correlation was found. Those expensive gates were not rerun in the correction round, and their prior summarized results are not promoted to independent exact-head proof.
- Independent-review correction round 2: N1 is fixed from base `e7e204fe7d1c28b7239b6dac045c76be93829c4c` by CLI-generated migration `20260810103823_enforce_owner_balance_global_lock_order.sql`. Allocator, cash, distribution, transfer, reversal, and legacy cash-effect paths now share financial-month then lifecycle then stable-key ordering with replay-before-lock proof and private-helper denial.
- N1 evidence: deterministic same-owner/same-month source/generation RED reproduced `deadlock detected` and the wrong reverse-order wait key; GREEN is 2/2 with no `40P01`, current ready/typed-stale watermarks, and one allocation. Focused database/security is 194/194, original/correction concurrency is 6/6 and 8/8, reset/lint/advisors/build/diff are green. Final focused re-review accepted N1 with zero new Critical, Important, or Minor findings. No browser/full matrix was rerun.

## Track 4A - immutable owner close authority

- Status: locally approved on 2026-08-10 at correction commit
  `e3ed33fc62d039048d2d0d2ca72424b8180917cc`. The final focused independent
  review found no remaining Critical, Important, or Minor finding in scope.
  Track 4B is open but not yet implemented.
- Outcome: Super Admin can inspect typed readiness, close immutable revision 1,
  reopen for a reason into N+1, record a checked evidenced correction, reroll
  affected periods in order, and close revision 2 without changing revision 1.
  Finance roles are read-only; Operations, unaffiliated, cross-tenant,
  anonymous, and service-role paths fail closed.
- Integrity: five authority tables use RLS plus FORCE RLS and checked immutable
  writes. Frozen lines retain exact source identities/fingerprints, four
  components reconcile exactly, decimal strings never cross through JavaScript
  number coercion, and a literal oracle reproduces both closed content hashes.
- Browser evidence: one retained exact-worktree flow passed 14 phases from
  visible Finance navigation through R1, reopen, `-25.00` correction, ordered
  reroll to held cash `1830.00`, R2, Finance read-only, Operations denial, and
  final database/idempotency checks.
- Final verification: clean reset; all pgTAP 1,603/1,603; Track 4A 46/46;
  finance integration 88/88; lifecycle concurrency 6/6; close concurrency 2/2;
  complete application 1,461 pass plus one intentional skip; demo tools 45/45;
  TypeScript, ESLint, build, route/copy, five role journeys, lint/advisors, and
  diff checks green.
- Matrix residual: the complete accessibility crawl remains non-green on the
  same 98 cross-module backlog findings. `/balances` has zero axe, navigation,
  page-error, overflow, or 200%-keyboard failure. No unrelated accessibility
  repair was pulled into Track 4A.
- Scope: local only. No statement number, publication, PDF, Excel, email,
  Storage, hosted mutation, real IPS data, push, merge, or deployment.
- Verification report: `docs/verification/track-4a-owner-close-authority.md`.
- Independent review correction round 1: review base `aadf6cf9` returned C1-C5
  and I1. All six findings are implemented together in CLI-generated migration
  `20260810131852_owner_close_correction_round.sql`, retained database and
  two-session race oracles, generated types, and the stale/readiness UI fix.
  Focused independent re-review remains pending; Track 4B stays blocked and no
  approval is claimed.
- Correction evidence: clean reset/fixture; Track 4A 61/61; affected finance,
  security, and role pgTAP 282/282; owner-close concurrency 9/9; focused app
  11/11; TypeScript, ESLint, DB lint, build, and diff checks green. Both R1/R2
  input hashes reproduce from retained canonical bytes; exact zero evidence,
  repeated corrections, nested N+1 recovery, cross-month lock order, and exact
  concurrent replay have literal/race coverage. Browser acceptance and the
  expensive full matrix were not rerun under the correction brief.
- Independent-review correction round 2: the focused re-review accepted
  C1/C3/C4/C5/I1 and retained only C2 predecessor drift. CLI-generated
  migration `20260810135907_owner_close_predecessor_authority.sql` now derives
  first-month opening from the approved entry chain and later-month opening
  from the immediate closed/current predecessor under ascending multi-month
  locks. A stale or non-current predecessor rejects atomically with a typed
  continuity error.
- Round 2 evidence: Track 4A 72/72; affected finance/security/role pgTAP
  293/293; owner-close concurrency 11/11 including both predecessor-reclose
  start orders; clean reset/fixture, DB lint, and production build green. The reviewer sequence
  now rejects stale-opening `-100.00`, accepts safe `-50.00`, and rerolls exact
  `55.00 - 50.00 = 5.00`. No application/type API changed; browser and full
  matrix were not rerun. Focused independent re-review remains mandatory and
  Track 4B is still blocked.
- Independent-review correction round 3: final focused C2 review found the
  inverse serialized order could invalidate an already-recorded later
  correction. CLI-generated migration
  `20260810142220_owner_close_downstream_viability.sql` now propagates a
  proposed target close through the complete later movement chain under the
  existing ascending recovery locks and atomically rejects the predecessor
  command with `owner_close_correction_downstream_negative` if any successor
  would cross below zero.
- Round 3 evidence: Track 4A 80/80, including a second-successor full-chain
  oracle; safe/crossing two-session subset 4/4; complete owner-close
  concurrency 13/13; clean reset/fixture, DB lint, production build, and diff
  checks green. Browser and the expensive full matrix were not rerun. Focused
  independent re-review remains mandatory and Track 4B stays blocked.
- Independent-review correction round 4: the remaining C2 proof found a
  movement-only future month omitted by period-anchored recovery. CLI-generated
  migration `20260810144252_owner_close_movement_only_scope.sql` now discovers,
  locks, and propagates immutable component-movement months even when no owner
  period row exists, preserving ascending financial-month/period then
  lifecycle/source order and exact-once movement arithmetic.
- Round 4 evidence: literal owner009 movement-only oracle and Track 4A 83/83;
  both correction/first-generation start orders 2/2; complete owner-close
  concurrency 15/15; clean reset/fixture, catalog/grants, DB lint, production
  build, and diff checks green. Browser and full matrix were not rerun.
- Final independent approval: exact clean head `e3ed33fc`; pgTAP 83/83;
  movement-only race subset 2/2; checked rollback probe rejected with typed
  `23514 owner_close_correction_downstream_negative` and zero residue;
  function ownership, grants, locked search paths, and all five RLS plus FORCE
  RLS tables passed. Track 4A is approved locally and the Track 4B gate is
  open. Hosted and production readiness remain unverified.

## Track 4B - official Owner Statement publication

- Status: local implementation and criterion self-review complete on 2026-08-10;
  independent milestone review pending. No approval is claimed.
- Outcome: Super Admin publishes an immutable non-PII numbered statement from a
  current closed revision, downloads retained byte-verified PDF/XLSX, and can
  publish N+1 after reopen/reclose with explicit supersession while N remains
  unchanged. Finance is read-only; Operations is denied.
- Integrity: canonical statement authority consumes only frozen close revision,
  line, and source evidence. Publication/artifact tables use RLS plus FORCE RLS,
  checked immutable writes, actor-bound idempotency, create-only private paths,
  exact hash/size verification, and typed incomplete-artifact remediation that
  blocks reopen/supersession until both artifacts are complete.
- Browser evidence: one exact-worktree flow passed Super Admin R3 download and
  R4 publication/supersession, Finance read/download without controls,
  Operations denial, database/hash effects, prior-byte preservation, and fixture
  restoration.
- Matrix evidence: complete application 1,477 pass plus one intentional skip;
  final demo tools 47/47; routes 47/47; roles 5/5; concurrency 13/13, 4/4, 6/6,
  15/15, and 4/4; affected pgTAP 96/96; reset/fixture, types, lint/advisors,
  build, and diff checks green. Bundled workbook inspection rendered all three
  sheets with no formula errors or material clipping; Poppler rendered the two-
  page PDF.
- Residual: the expensive accessibility crawl retains the same 98 unrelated
  backlog findings and zero changed `/balances` findings. Hosted Supabase,
  Vercel, email, cron, backups/recovery, real IPS data, cutover, push/merge, and
  Track 5 remain outside this milestone.
- Verification: `docs/verification/track-4b-owner-statement-publication.md` and
  `docs/verification/owner-statement-redacted-reconciliation.md`.
