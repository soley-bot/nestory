# IPS pilot reconciliation

Status: **BLOCKED — synthetic reconciliation passed; real IPS pilot not run**

All references and people in this record are synthetic. No real IPS dataset,
personal data, credentials, email addresses, or raw storage paths are recorded.

## Scope and provenance

- environment: Vercel production and hosted Supabase
- organization reference: Nestory synthetic rehearsal organization
- property / unit scope: `SYN-RDY-260812` / `SYN-B01`
- pilot window (UTC): `2026-08-12`
- runtime candidate full SHA: `fdd0c91537ee96cad754bdfa5c47e883b0805ec7`
- deployed full SHA: `fdd0c91537ee96cad754bdfa5c47e883b0805ec7`
- hosted migration head: `20260812040230`
- source-authority snapshot and SHA-256: owner-close input hash `21489a514746385b5123431ed109b474a83279de5679c1830638613a1fae8e55`
- reconciliation owner: sole synthetic-rehearsal operator
- independently reviewed by: not assigned

The evidence commit follows the runtime candidate and changes only the two
canonical readiness records. The verifier records the evidence commit from
`HEAD`; no self-referential evidence SHA is stored here.

## Setup and tenancy

| Measure | Expected | Actual | Difference | Evidence |
| --- | ---: | ---: | ---: | --- |
| Properties in scope | 1 | 1 | 0 | `SYN-RDY-260812` |
| Units in scope | 1 | 1 | 0 | `SYN-B01` |
| Approved owners | 1 | 1 | 0 | approved synthetic opening authority |
| Active leases | 1 | 1 | 0 | active synthetic lease |
| Occupants | 1 | 1 | 0 | current synthetic tenant |
| Billing schedules | 1 | 1 | 0 | approved monthly rent policy |
| Received deposits | 0 | 0 | 0 | no deposit in synthetic scenario |
| Setup blockers | 0 | 0 | 0 | setup readiness passed |

## Financial lifecycle

| Measure | Expected | Actual | Difference | Evidence |
| --- | ---: | ---: | ---: | --- |
| Rent invoices | 1 / USD 925.00 | 1 / USD 925.00 | 0 / USD 0.00 | August invoice generated |
| Tenant payments | 1 / USD 925.00 | 1 / USD 925.00 | 0 / USD 0.00 | invoice paid |
| Outstanding tenant balance | USD 0.00 | USD 0.00 | USD 0.00 | paid status |
| Maintenance paid costs | 3 / USD 162.50 | 3 / USD 162.50 | 0 / USD 0.00 | approved hosted costs |
| Approved expenses | 3 / USD 162.50 | 3 / USD 162.50 | 0 / USD 0.00 | finance approvals |
| Owner invoice payments | 4 / USD 236.50 | 4 / USD 236.50 | 0 / USD 0.00 | costs plus management fee settlement |
| Owner distributions | 0 / USD 0.00 | 0 / USD 0.00 | 0 / USD 0.00 | none in scenario |
| Published owner statements | 1 | 1 | 0 | `OS-202608-7ABB45D6D861` |

- paid-cost evidence registered / submitted / approved counts: `3 / 3 / 3`
- duplicate evidence attempts rejected: local Super Admin forgery and replay regressions pass; no destructive hosted forgery attempt was made
- maintenance task-to-expense-to-statement trace references: `SYN-PILOT-EVIDENCE-260812-B` and `SYN-FIN-MEMBER-260812`
- owner close and statement publication references: revision `1`; statement `OS-202608-7ABB45D6D861`
- unexplained financial difference: USD `0.00`
- owner statement download verification: PDF and Excel downloads completed with no browser download failure

## Recurring maintenance and notifications

| Measure | Expected | Actual | Difference | Evidence |
| --- | ---: | ---: | ---: | --- |
| Active recurrence series | not in hosted scenario | not run | n/a | cron activation excluded |
| Due occurrences generated | not in hosted scenario | not run | n/a | cron activation excluded |
| Duplicate occurrences | 0 | not run hosted | n/a | local concurrency contract passed |
| Notifications queued | 1 assigned-task flow | 1 visible role-scoped flow | 0 | hosted role journey |
| Notifications delivered | 1 assigned-task flow | 1 visible role-scoped flow | 0 | Operations Member journey |
| Notification failures | 0 | 0 observed | 0 | production error log query empty |

- catch-up window and timezone: not activated
- duplicate-run/concurrency result: local contract passed; hosted runner not invoked
- failed-delivery retry result: not exercised hosted
- operations-visible status-history result: assigned member started and submitted; manager approved completion

## Role journeys and usability

| Role | Journey | Result | Evidence | Blocking issue |
| --- | --- | --- | --- | --- |
| Super Admin | Setup through statement publication | Pass | closed revision 1 and published statement | same human as other roles |
| Finance Manager | Review, approve, and lock month | Pass | paid costs approved; August locked | cannot independently sign own rehearsal |
| Finance Member | Submit paid cost and inspect read-only state | Pass | USD 5.00 direct submission | same human as approver |
| Operations Manager | Work through evidence-bound cost submission | Pass | USD 37.50 task-bound cost | same human as member |
| Operations Member | Assigned work and scoped mutation path | Pass | task started and submitted for review | same human as manager |

- accessibility result and artifact: affected route/role audit recorded zero failures
- mobile maintenance result and artifact: covered by the affected UI route audit; no physical-device claim
- terminology or navigation exceptions: none blocking the synthetic journey

## Exceptions and sign-off

| Reference | Impact | Owner | Due date | Decision / approval |
| --- | --- | --- | --- | --- |
| REAL-DATA | No real IPS import or reconciliation | unassigned | before pilot | blocking |
| DUTY-SPLIT | One person operated all five synthetic roles | unassigned | before approval | blocking |
| BACKUP | No listed physical/PITR backup or restore rehearsal | unassigned | before production approval | blocking |
| CRON | Scheduled runner was not activated | user-held | when separately authorized | intentionally excluded |

- reconciliation result: **BLOCKED for real pilot; synthetic reconciliation passed with USD 0.00 unexplained difference**
- product/data owner: not signed
- finance approver: not independently signed
- operations approver: not independently signed
- independent reviewer: not signed
- signed at (UTC): not signed
- rollback or continue decision: do not approve a real pilot or production cutover until the four exceptions above are resolved
