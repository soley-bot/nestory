# Renewals, Transfers, and Corrections

## Decision rule

The word "renewal" is not sufficient to choose a database operation.

Nestory first asks:

1. Is this the same executed agreement identity or a newly executed agreement?
2. Is the unit unchanged?
3. Is the financially responsible tenant set unchanged?
4. Is the effective period supported by Plan 04?
5. What downstream records already exist?

The result is either a new term or relationship under the same lease, a
successor lease, or a clear unsupported-policy stop.

## Decision matrix

| Business event | Lease identity | Required history behavior |
| --- | --- | --- |
| Rent changes under a signed amendment; same unit and responsible tenants | Same lease | Use Plan 04 unchanged to create/schedule the authoritative term. Protect elapsed and financially referenced economics; permit Plan 04's checked future-range adjustment. |
| End date extends under an amendment; same unit and responsible tenants | Same lease | Use Plan 04 unchanged to create/schedule the authoritative term and adjust scheduled occupancy only when explicitly confirmed. |
| New executed agreement; same unit and people | New successor lease | Link predecessor/successor as `renewal`. Preserve old records. |
| Primary tenant changes after commencement | New successor lease | Link as `tenant_replacement`. Never replace the old party in place. |
| Co-tenant set changes under a documented amendment | Same lease only if operator identifies that amendment | End/add dated party rows after impact review. Otherwise use a successor lease. |
| Authorized occupant or billing contact changes | Same lease | End/add dated relationship rows. |
| Scheduled Unit transfer | New successor lease reservation | Link the planned successor without claiming move-out/move-in; retain separate scheduled boundaries and explicit boundary kinds. |
| Actual Unit transfer | New successor lease and occupancy | Link as `unit_transfer`; record confirmed source move-out and destination move-in separately. Never update the old occupancy's Unit. |
| Early termination | Same lease, ended | End/terminate the applicable term through Plan 04, record actual occupancy separately, preserve all dependencies. |
| Month-to-month continuation | Unsupported initially | Stop until IPS approves term end, due-day, proration, and charge policy. |
| Holdover occupancy | Unsupported initially | Preserve current facts and raise a repair state; do not silently extend the lease or term. |
| Same-day move-out/move-in | Unsupported initially | Stop until IPS defines day ownership or time precision. |
| Wrong person/date selected | Correction, not business transition | Preserve voided/superseded evidence and apply the dependency contract. |

## Lease continuity link

Successor relationships require an append-only, organization-scoped continuity
record with:

- predecessor lease ID;
- successor lease ID;
- relationship kind: `renewal`, `replacement`, `tenant_replacement`, or
  `unit_transfer`;
- effective date;
- reason;
- actor and timestamp;
- optional source document ID; and
- checked-workflow request/idempotency identity.

The link must:

- reject self-links, cycles, cross-organization links, branches, merges, and
  duplicate accepted successors;
- allow at most one accepted outgoing link for a predecessor Lease and one
  accepted incoming link for a successor Lease across all relationship kinds;
- preserve both leases independently;
- never copy financial dependencies silently; and
- expose predecessor and successor exact links in Lease history.

One row does not imply that every charge, receipt, deposit, task, document, or
statement moved to the successor.

Continuity evidence has append-preserving version state. A wrong link is
voided or superseded with reason, actor/time, prior/replacement link IDs, and
impact evidence; it is never deleted or silently retargeted. Only the accepted
link participates in incoming/outgoing cardinality and cycle checks. Those
checks must serialize concurrent link creation so two transactions cannot
create a branch, merge, or cycle.

Continuity evidence state (`accepted`, `superseded`, `voided`) is separate from
its business lifecycle (`planned`, `effective`,
`cancelled_before_effective`). Accepted planned and effective links both count
toward incoming/outgoing cardinality. A cancelled-before-effective link
remains visible history but does not block a later checked successor plan.

TB-06 owns a checked `cancel_successor_plan` operation. Before the successor is
effective, it rechecks dependencies and atomically moves the planned link,
successor Lease, successor reservation, planned parties/participants, and
occupancy to their cancelled-before-effective lifecycles. In the same
dependency-checked transaction it invokes the merged Plan 04 checked action
that cancels the successor's authoritative planned term without rewriting term
history. If that Plan 04 action is unavailable, the successor plan cannot be
cancelled. The operation creates no actual/effective fact, deletes nothing, is
payload-idempotent under cancel-versus-activate races, and releases
accepted-link cardinality for one later checked plan.

The continuity effective date must align with the accepted predecessor and
successor party/occupancy boundary kinds. An unknown boundary remains a
blocking prerequisite rather than being inferred from a term date.

## Extension under the same lease

An extension is permitted only when:

- the operator identifies an amendment to the same agreement;
- property and unit are unchanged;
- the responsible tenant set is unchanged, except for separately evidenced
  role amendments;
- the Plan 04 term workflow accepts the new dates/economics;
- the occupancy plan is explicitly confirmed rather than inferred from term
  dates; and
- the impact response permits the action.

Sequence:

1. preview affected terms, draft charges/obligations, workflows, closed
   periods, and artifacts;
2. create or schedule the authoritative term through Plan 04 unchanged;
3. update only future scheduled occupancy when the operator supplied it;
4. retain prior terms, parties, actual occupancy, and published artifacts; and
5. record exact activity/continuity evidence.

Plan 04 may perform its existing checked adjustment to the unused future range
of the preceding active term when scheduling a replacement. Track B does not
replace or redefine that behavior. It must not rewrite elapsed term coverage
or economics already referenced by a financial, issued, closed, or published
record.

An extension does not reopen a vacated actual occupancy. A return after
confirmed vacancy uses a successor lease in the initial model.

## Replacement lease

A replacement is the safe default when agreement identity or financial
responsibility changes.

The checked operation must:

1. lock the predecessor lease and affected unit interval;
2. run/recheck dependency impact;
3. end or schedule the end of predecessor responsibility and occupancy;
4. close or schedule predecessor term scope only through the unchanged Plan 04
   workflow when the predecessor agreement ends;
5. create the successor Lease and authoritative term through the Plan 04
   checked creation path;
6. create or adopt exactly one normalized initial party and occupancy set with
   explicit boundary kinds, evidence, and provenance;
7. create occupancy-participant rows only for explicitly evidenced
   individuals;
8. add the continuity link;
9. leave all predecessor finance and published records on the predecessor;
10. require explicit downstream operations for deposits, credits, balances, or
   open drafts; and
11. commit atomically or change nothing.

The operation must not clone a prior deposit event, receipt, invoice,
allocation, or statement line.

The successor operation must have one normalized-create owner. If the checked
Plan 04 creation path still invokes a compatibility trigger that creates party
or occupancy rows, the operation returns and adopts those exact IDs, validates
them against the explicit normalized payload, and enriches them inside the
guarded transaction. It must not call a second insert path. Alternatively, a
single checked composition may create the normalized rows once and project the
Lease header afterward. Mixed trigger-plus-explicit duplicate creation is
forbidden.

Term dates do not silently supply party, scheduled occupancy, actual
occupancy, or participant boundaries. Missing explicit facts remain
`unknown` or stop with a named prerequisite.

## Unit transfer

Unit transfer is a successor-lease workflow, not a generic Lease edit.

Required input:

- predecessor lease;
- destination property/unit;
- separate last scheduled and actual dates in the old Unit, each with boundary
  kind and evidence;
- separate first scheduled and actual dates in the new Unit, each with
  boundary kind and evidence;
- responsible tenant set;
- reason and supporting document;
- handling choices returned by downstream impact; and
- payload-bound idempotency key.

Required checks:

- same organization;
- destination unit belongs to the selected property;
- no scheduled/actual overlap in either unit;
- source actual move-out exists before destination actual move-in;
- whole-day boundaries follow the no-same-day rule;
- Plan 04 term scope for the successor is explicit;
- source and destination property-period locks are respected by Track A;
- deposit custody is not transferred implicitly; and
- issued/published history remains attached to the predecessor.

The destination lease can have the same people, but it still has a new lease
identity because unit scope changed.

### Scheduled transfer versus actual transfer

Scheduling a transfer creates a successor reservation, planned responsibility,
planned participant facts where explicitly supplied, and scheduled Unit
boundaries. It does not:

- write either actual move date;
- mark the source occupancy vacated;
- mark the destination occupied;
- end source participants automatically; or
- establish a vacancy boundary.

Completing the transfer is a later checked operation. It records the source
actual move-out and destination actual move-in from explicit evidence,
resolves or ends participant facts explicitly, and activates the accepted
successor continuity link from `planned` to `effective`. With whole-day
inclusive semantics, destination actual move-in must be after source actual
move-out; same-day completion remains unsupported.

## Early termination and move-out

Contract end and physical move-out are separate:

- Plan 04 records the authoritative terminated term/economics.
- Track B records notice, scheduled move-out, and actual move-out.
- Party responsibility ends on its evidenced date.
- Track A decides charge, invoice, receipt, deposit, close, and statement
  consequences.

An operator may record move-out before the final contractual end or terminate
the agreement before physical move-out. The impact response must explain
unsupported rent policy rather than making the dates equal.

## Correction versus change

| Scenario | Classification | Result |
| --- | --- | --- |
| Typo/current contact edit | Current master-data edit | Update `people`; current directory refreshes; artifact snapshots stay fixed. |
| Wrong person chosen before start, no dependencies | Draft factual correction | Checked in-place correction plus audit. |
| Wrong person recorded in history | Historical factual correction | Void false row and add linked accepted row. |
| Tenant actually changes | Business transition | Successor lease. |
| Scheduled move date changes before event | Planning change | Checked scheduled-date update. |
| Actual move date was entered incorrectly | Historical factual correction | Linked superseding evidence after impact review. |
| Move actually occurs on a different date from schedule | Normal completion | Preserve schedule; record actual date. |
| Unit was wrong on a commenced lease | Historical scope correction | Do not rewrite. Use correction lineage and, for actual movement, a successor transfer lease. |
| Person records are duplicates | Identity resolution | Preserve source identity and immutable redirect; do not rewrite artifacts. |

## Deposit boundary

The current compatibility trigger can also rewrite a `lease_deposits` row from
Lease form values. Track B does not own deposit custody or disposition.

Therefore:

- TB-01 must stop party/occupancy history damage without introducing a new
  deposit lifecycle;
- current deposit protection is an unresolved Track A gap: repository checks
  around deposit events do not by themselves prove that the mutable parent
  deposit obligation cannot be reduced or reclassified inconsistently;
- Track B must not describe the current compatibility deposit write as safe or
  complete. A transition that requires a deposit change stops until a merged
  Track A checked custody/obligation action is available;
- a successor lease receives no deposit balance automatically;
- transfer, refund, retention, or application requires Track A's checked
  operation and exact event identity; and
- the required Owner Close amendment is recorded in
  `92-required-cross-plan-amendments.md`.

## Archive and cancellation

- Cancel an unstarted lease through a checked cancellation operation; retain
  the reservation, planned parties, and planned participants as
  `cancelled_before_effective`, with no actual occupancy or effective
  responsibility.
- Terminate and move out a commenced lease before archiving.
- Reject direct archive of an active lease.
- Restore only through the dependency and overlap checks.
- Do not use archive to hide an incorrect party, unit, date, or deposit.

## Stop conditions

Stop the implementation operation, not the whole planning program, when:

- the operator cannot say whether the agreement is amended or newly executed;
- a unit transfer boundary conflicts with another occupancy;
- same-day turnover is required;
- month-to-month or holdover policy is required;
- actual dates would have to be inferred;
- a person/unit/lease cannot be resolved exactly;
- a closed period or published artifact requires a Track A action that does
  not yet exist;
- a deposit would need to move without a checked custody operation; or
- the requested action would attach predecessor financial history to a
  successor.

Return a business-readable repair path and exact affected links. Do not fall
back to a generic "dependencies exist" message.
