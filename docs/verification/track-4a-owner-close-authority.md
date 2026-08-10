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
