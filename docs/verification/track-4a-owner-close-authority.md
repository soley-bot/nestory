# Track 4A owner close authority verification

## Verification boundary

This is local implementation evidence for immutable owner close authority. It
does not approve the milestone and does not verify hosted Supabase, Vercel,
email, Storage, backups, cron, real IPS data, or Owner Statement publication.

- Branch: `codex/ips-operational-readiness`
- Starting approval HEAD: `6609b29`
- Approved Track 3 base: `5688bafb0e9242f1ff0284a4ada7e5a8d5bc7462`
- Date: 2026-08-10

## Operator outcome verified

From visible Finance navigation, a real local Super Admin inspected exact owner
close readiness, closed immutable revision 1, reopened for a reason into
revision 2, recorded a checked evidenced correction, rerolled current and later
periods in order, and closed revision 2 without changing revision 1. Finance
Manager/Member read both frozen revisions without controls. Operations
Manager/Member could not discover or enter the route.

Exact browser/database values included:

- readiness: IPS due to owner `200.50`, IPS-held owner cash `1855.00`, owner due
  to IPS `0.00`, security-deposit custody `860.00`;
- correction: `-25.00` to IPS-held owner cash with source reference and evidence
  SHA-256;
- rerolled held cash: `1830.00`;
- two closed revisions with reproducible lowercase SHA-256 hashes;
- revision 2 supersedes revision 1; revision 1 snapshot remains byte-identical;
- no pending financial-idempotency request after the flow.

## Authority and integrity evidence

- Five close authority tables have RLS plus FORCE RLS, authenticated tenant read
  policies, no application-role direct mutation, and immutable checked writes.
- Public RPCs authorize before disclosure and deny Operations, unaffiliated,
  cross-tenant, absent-actor, anonymous, and service-role access.
- Exact decimal strings cross the application boundary; numeric JSON is rejected.
- Frozen opening/movement/closing rows reconcile every component and preserve
  exact source IDs/fingerprints.
- A literal independent test oracle reproduces both revision content hashes.
- Shared actor-bound idempotency proves exact replay and payload/actor conflict.
- Two real-session races prove close/close and correction/reroll serialization
  without deadlock or partial state.

## Final command evidence

| Gate | Result |
| --- | --- |
| Clean local reset/migration apply | pass, both Track 4A migrations |
| Guarded baseline fixture | pass; operating month open, isolated close month locked |
| Track 4A pgTAP | 46/46 |
| Complete pgTAP | 44 files, 1,603/1,603 |
| Tenant expense reversal integration | 88/88 |
| Database lint | exit 0; five unchanged warning-only unused variables |
| Error-level database advisors | zero findings |
| Owner lifecycle concurrency | 6/6 |
| Owner close concurrency | 2/2 |
| Focused changed application | 17/17 |
| Complete application | 196 files; 1,461 pass, one intentional skip |
| Demo/tool contracts | 45/45 |
| TypeScript / ESLint | pass / pass |
| UI route coverage / copy | 47/47 / zero prohibited narration |
| Production build | pass; known multiple-lockfile warning only |
| Real local role journeys | 5/5 |
| Complete close browser flow | 14/14 phases |
| Diff check | pass |

## Accessibility and backlog boundary

The full authenticated axe/viewport/keyboard crawl completed and retained the
same program backlog: 88 contrast violations, two property-account scroller
findings, four `/users-roles` React `#419` page errors, and four Maintenance-
board findings. None is on the changed owner-close route.

`/balances` passed all four viewport axe/navigation/page-error checks and its
720x450 200%-text keyboard traversal with zero failures. The ignored local
summary is at
`artifacts/ui-redesign/ui-redesign-2026-08-10T12-22-28.961Z-axe-p18520/summary.json`.
No full-app accessibility pass is claimed.

## Review handoff

Independent review must still validate accounting, authorization, tenant
isolation, evidence/source integrity, idempotency, concurrency, immutable
history, scope, and test validity. Track 4B remains blocked until that review.

## Correction round 1 verification addendum

Review base `aadf6cf9` produced C1-C5 and I1. The coordinated correction uses
new migration `20260810131852_owner_close_correction_round.sql` and preserves
all previously approved migrations.

Verified corrections:

- a split atomic cent freezes one zero movement and one zero activity line for
  the losing owner, each with one immutable source link, while all component
  totals remain unchanged;
- positive-first and negative-first correction/reroll/correction sequences use
  opening plus the complete movement set exactly once and reject negative
  closing authority atomically;
- later N+1 preparing state survives an earlier reopen/correction, ordered
  reroll, and later reclose without an orphan or false-ready UI;
- cross-month reopen/correction versus later reroll serializes in both start
  orders without `40P01`;
- exact concurrent duplicates for close, reopen, and correction replay the same
  IDs; payload/actor conflicts remain atomic;
- retained canonical input bytes independently reproduce both R1 and R2 input
  hashes after reroll.

| Focused affected gate | Correction result |
| --- | --- |
| Clean reset and guarded fixture | pass |
| Track 4A pgTAP | 61/61 |
| Affected finance/security/role pgTAP | 7 files, 282/282 |
| Owner-close concurrency | 9/9 |
| Focused owner-close application | 3 files, 11/11 |
| Database lint | zero errors; same five legacy warnings |
| TypeScript / ESLint | pass / pass |
| Production build | pass with root local env; known lockfile warning only |
| Diff check | pass |

No browser or complete-matrix rerun is claimed for the correction round. A
focused independent re-review remains required before Track 4A approval or
Track 4B work.

## Correction round 2 verification addendum

Focused re-review accepted C1/C3/C4/C5/I1 and retained one C2 gap: a preserved
later preparing revision could evaluate correction capacity from its stale
stored opening after the predecessor closing changed.

New migration `20260810135907_owner_close_predecessor_authority.sql` corrects
only that gap:

- a first-month correction derives opening from the locked approved
  opening-entry chain for the exact component;
- a later-month correction locks from the immediate predecessor month forward
  in ascending order and requires that predecessor period and close series to
  be closed and current;
- correction capacity is current opening authority plus the complete target-
  month movement set plus the proposal exactly once;
- missing/stale predecessor authority returns typed
  `owner_close_correction_predecessor_not_current` before lasting effects.

Retained evidence:

| Focused gate | Result |
| --- | --- |
| Track 4A pgTAP | 72/72 |
| Affected finance/security/role pgTAP | 7 files, 293/293 |
| Owner-close concurrency | 11/11 |
| Database lint | zero errors; same five legacy warnings |
| Clean migration reset and guarded fixture | pass |
| Production build | pass; known multiple-lockfile warning only |

The new literal oracles cover negative-first correction/reroll/safe-second/
crossing rejection, typed rejection while the predecessor is not current, and
the reviewer sequence where predecessor held cash changes from `1855.00` to
`55.00`. The stale later N+1 rejects `-100.00` atomically, accepts safe
`-50.00`, and rerolls to exact opening `55.00`, movement `-50.00`, closing
`5.00`.

Two real-session tests cover predecessor-reclose first and later-correction
first. Both serialize without `40P01`, leave no pending request or negative
component, and end at the same exact `5.00` later closing. No application/type
surface changed; the production build is green. No browser or full-matrix rerun is claimed. Focused
independent re-review is still required; Track 4B remains blocked.

## Correction round 3 verification addendum

The final focused C2 re-review accepted predecessor-first authority but found
the inverse serialized order unsafe: a later `-100.00` correction could be
accepted against `1855.00`, after which a predecessor reduction to `55.00`
could leave the later component at `-45.00` on reroll.

CLI-generated migration
`20260810142220_owner_close_downstream_viability.sql` corrects only this path.
After deriving the target proposed close exactly once, the checked correction
RPC propagates that closing through every known later period in ascending
month order using each period's complete component movement set. If any
successor would be negative, the predecessor-changing command fails atomically
with `23514 owner_close_correction_downstream_negative`.

Retained literal evidence covers both the immediate inverse order and a full
chain where the immediate successor remains `5.00` but a second successor
would become `-5.00`. Crossing rejection leaves no correction, allocation,
movement, idempotency, duplicate-revision, or negative-component residue. The
safe compensated chain succeeds at exact opening `55.00`, movement `-50.00`,
closing `5.00`.

| Focused gate | Result |
| --- | --- |
| Track 4A pgTAP | 80/80 |
| Safe and crossing predecessor/correction races | 4/4 |
| Complete owner-close concurrency file | 13/13 |
| Clean migration reset and guarded fixture | pass |
| Database lint | zero errors; same five legacy warnings |
| Production build | pass; known multiple-lockfile warning only |
| Diff check | pass |

The two crossing races prove both serialized outcomes: predecessor-first makes
the later command lose with `owner_close_correction_negative_component`, while
later-first makes the predecessor-lowering command lose with
`owner_close_correction_downstream_negative`. The retained `-50.00` controls
still allow both commands to succeed. No browser or expensive full-matrix
rerun is claimed. Focused independent re-review remains required; Track 4B is
still blocked.

## Correction round 4 verification addendum

The remaining focused C2 review found that round 3 discovered downstream
months only through `owner_balance_periods`. A supported immutable future
movement could therefore exist before its period row: Garden Court owner 009
had zero next-month periods, a `-500.00` held-cash transfer movement, and a
current `500.00` closing. A current-month `-1.00` correction was incorrectly
accepted even though first generation would project `-1.00` next month.

CLI-generated migration `20260810144252_owner_close_movement_only_scope.sql`
adds movement months to the existing recovery scope. Financial-month and
owner-period advisory locks are still acquired in ascending month order before
the lifecycle and stable movement-row locks. Downstream propagation now
iterates the union of period months and immutable component-movement months,
summing each month's complete component movements exactly once. A negative
movement-only successor raises the existing typed
`23514 owner_close_correction_downstream_negative` before lasting effects.

Retained sequential evidence proves the exact `[0 period rows, -500.00 future
movement, 500.00 current closing]` fixture and atomic rejection of `-1.00` with
zero correction, allocation, movement, or idempotency residue. The round-3
immediate and second-successor period-chain oracles remain green.

| Focused gate | Result |
| --- | --- |
| Track 4A pgTAP | 83/83 |
| Movement-only correction/generation races | 2/2 |
| Complete owner-close concurrency file | 15/15 |
| Clean migration reset and guarded fixture | pass |
| Function owner/search-path/grants catalog | pass |
| Database lint | zero errors; same five legacy warnings |
| Production build | pass; known multiple-lockfile warning only |
| Diff check | pass |

Both real-session start orders serialize without `40P01`: correction-first
holds the discovered future movement month before first generation, and
generation-first holds it before correction. In both orders the correction is
the atomic loser, first generation retains its expected blocked predecessor
state, and there is no pending claim, loser residue, duplicate, or negative
component. No browser or expensive full-matrix rerun is claimed. Focused
independent re-review at exact clean head
`e3ed33fc62d039048d2d0d2ca72424b8180917cc` independently reran pgTAP 83/83
and the movement-only race subset 2/2, reproduced the typed `23514` rejection
with zero residue, and confirmed function ownership, grants, locked search
paths, and RLS plus FORCE RLS. It found no Critical, Important, or Minor
finding in scope. Track 4A is locally approved and the Track 4B gate is open;
hosted and production readiness remain unverified.
