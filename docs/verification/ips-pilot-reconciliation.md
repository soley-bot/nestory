# IPS pilot reconciliation

Status: **BLOCKED — template only; no pilot reconciliation recorded**

Use redacted business references and aggregate values. Do not record names,
emails, tokens, credentials, raw storage paths, or personal financial details.

## Scope and provenance

- environment:
- organization reference:
- property / unit scope:
- pilot window (UTC):
- runtime candidate full SHA:
- deployed full SHA:
- hosted migration head:
- source-authority snapshot and SHA-256:
- reconciliation owner:
- independently reviewed by:

The verifier records the evidence commit SHA from `HEAD`; do not place a
self-referential SHA inside this tracked file.

## Setup and tenancy

| Measure | Expected | Actual | Difference | Evidence |
| --- | ---: | ---: | ---: | --- |
| Properties in scope |  |  |  |  |
| Units in scope |  |  |  |  |
| Approved owners |  |  |  |  |
| Active leases |  |  |  |  |
| Occupants |  |  |  |  |
| Billing schedules |  |  |  |  |
| Received deposits |  |  |  |  |
| Setup blockers |  |  |  |  |

## Financial lifecycle

Record canonical amounts and currency. A zero must be written explicitly; a
blank value is incomplete.

| Measure | Expected | Actual | Difference | Evidence |
| --- | ---: | ---: | ---: | --- |
| Rent invoices |  |  |  |  |
| Tenant payments |  |  |  |  |
| Outstanding tenant balance |  |  |  |  |
| Maintenance paid costs |  |  |  |  |
| Approved expenses |  |  |  |  |
| Owner invoice payments |  |  |  |  |
| Owner distributions |  |  |  |  |
| Published owner statements |  |  |  |  |

- paid-cost evidence registered / submitted / approved counts:
- duplicate evidence attempts rejected:
- maintenance task-to-expense-to-statement trace references:
- owner close and statement publication references:
- unexplained financial difference:

## Recurring maintenance and notifications

| Measure | Expected | Actual | Difference | Evidence |
| --- | ---: | ---: | ---: | --- |
| Active recurrence series |  |  |  |  |
| Due occurrences generated |  |  |  |  |
| Duplicate occurrences | 0 |  |  |  |
| Notifications queued |  |  |  |  |
| Notifications delivered |  |  |  |  |
| Notification failures |  |  |  |  |

- catch-up window and timezone:
- duplicate-run/concurrency result:
- failed-delivery retry result:
- operations-visible status-history result:

## Role journeys and usability

| Role | Journey | Result | Evidence | Blocking issue |
| --- | --- | --- | --- | --- |
| Super Admin | Setup through statement publication |  |  |  |
| Finance Manager | Review, approve, close, publish |  |  |  |
| Finance Member | Submit paid-cost and opening evidence |  |  |  |
| Operations Manager | Recurring work through cost submission |  |  |  |
| Operations Member | Assigned work and denied out-of-scope mutations |  |  |  |

- accessibility result and artifact:
- mobile maintenance result and artifact:
- terminology or navigation exceptions:

## Exceptions and sign-off

Every exception needs a redacted reference, owner, due date, impact, decision,
and approval. Unowned or expired exceptions block the pilot.

| Reference | Impact | Owner | Due date | Decision / approval |
| --- | --- | --- | --- | --- |
|  |  |  |  |  |

- reconciliation result: **BLOCKED**
- product/data owner:
- finance approver:
- operations approver:
- independent reviewer:
- signed at (UTC):
- rollback or continue decision:
