# Financial write lifecycle safeguards

Status: implementation candidate, inactive by default. This document is not an
approval or an executable procedure for resetting any hosted workspace.
The migration creates no organization control rows and deletes no business data.
October/November references illustrate reporting boundaries and identify no customer operation.

## Client and database contract

`get_financial_write_context(organization_id)` requires an authenticated workspace
membership. It returns `generation`, `status`, `financial_start_date`, and
`enforced`. An unenrolled workspace returns generation `0`, status `open`, a null
start date and `enforced: false`.

Capture generation when rendering a form or preparing an intent. Forward that
captured value through the PostgREST `x-nestory-financial-generation` header.
Never fetch and attach the current generation only when submitting an old form.
Controlled writes fail with `financial_generation_required` for missing/malformed
headers, `financial_generation_stale` for another generation,
`financial_writes_frozen` while frozen, and `financial_date_before_start` for an
effect before the authority boundary. Refreshing a form requires the operator to
review and create a new intent; do not silently retry with the new generation.

Generic financial idempotency requests receive a database-owned generation.
Requests created before enrollment remain generation zero. Once enrolled, a
known key from another generation fails with `financial_intent_retired`, even
when the caller supplies a current header. This keeps historical request evidence
without returning deleted result IDs or treating the old key as a new request.
It does not delete or rewrite historical requests.
Specialized deposit journal intents and deferred owner-cash rows receive the same
generation stamp. Old journal reads/transitions fail with `financial_intent_retired`.
Journal reads also take the organization lock and reject frozen scopes. Cutover
batches and import runs are generation-owned intents; a new request key or current
header cannot commit, replay, replace or transition a prior-generation batch/run.
Their child rows check the parent generation. Retained import provenance remains
available to existing lease relationships; it is not permission to replay an import.
The deferred runner skips a property with any prior-generation queue row, before
consuming cash. Resolve that evidence through the reviewed cutover manifest; do
not clear a queue or unlock an unconfirmed journal attempt as an ordinary retry.

Private control rows have no application or service-role write privileges. There
is no activation API. Initial enrollment must be frozen. Generation and cutoff
cannot regress; advancing them requires remaining frozen. Control deletion is
prohibited. A separately reviewed operator artifact is required for enrollment,
generation advancement and reopening.

## Coverage and limits

The migration contains explicit table and command lists. Source-table row guards
cover ordinary DML, master/configuration preservation, invoice billing periods,
recognition/cash dates and relevant private journals. Shared claim/replay helpers
check the control before returning completed results; shared financial-month
locking checks effective dates. Named command entries also protect no-op and
specialized journal paths. Existing permissions, immutable-history rules and
domain validation still apply.
Master and configuration rows use freeze-only guards, so normal open-workspace
membership bookkeeping and nonfinancial edits need no generation header. Lease
billing commands, close/publication commands and actual financial rows still do.

Every covered write takes a shared transaction advisory lock for its organization,
including when no control exists. Control changes take its exclusive counterpart.
This makes a freeze wait for participating writers and prevents a later covered
write from passing the frozen state. Existing transactions and uncovered external
effects must still be inventoried and drained; a GitHub workflow concurrency group
alone does not contain application writers.
Guarded writers and lifecycle changes require `READ COMMITTED`, including before
enrollment. `REPEATABLE READ` and `SERIALIZABLE` fail before the control lookup with
`financial_write_requires_read_committed`: an older fixed snapshot could otherwise
hide a newly inserted control after waiting for its lock. This is the default
PostgREST/cron isolation contract; do not retry such work in a stale transaction.

The three private rent, lease-activation and deferred-cash runners acquire a
private, organization-scoped scheduler capability only in a genuine local database
operator/cron context. Frozen organizations are skipped. HTTP/service-role calls
cannot acquire that capability and must supply an expected generation. Existing
deferred cash remains queued; skipping a frozen organization does not clear or
authorize replay of historical queued cash after a reset.

The maintenance HTTP runner skips frozen organizations using the same shared
organization lock. Its current task/recurrence/notification writes are operational
and use the freeze-only row guard, so a global dispatch needs no generation header.
It receives no financial scheduler capability. Any future financial posting in
that runner must use a reviewed scoped integration and explicit financial intent.

These safeguards are not a complete cutover implementation:

- Specialized journal results are generation-retired, but old durable slots are
  retained. The reset manifest must classify/replace slots without discarding
  unconfirmed attempt evidence before new intents can be prepared for that scope.
- Storage bytes are external to the database transaction. Uploads, registration,
  cleanup, signed URLs, generated files and downloaded copies require their own
  containment and retention plan. Database guards are not a Storage-byte fence.
- `get_financial_report_context` adds a transactional source revision to the
  generation boundary. The report loader compares both before and after its
  reads and rejects a result when a covered source/master mutation commits
  between them. The revision advances once per writing transaction through
  triggers on the registered public source tables. This detects ordinary edits
  and backdating as well as resets; it does not turn several HTTP queries into
  one SQL snapshot. Authoritative close/publication fingerprints and their
  domain validation still apply, and new source tables need revision coverage.
- The explicit coverage lists must be reviewed whenever a new financial source,
  date column, mutation entry point or runner is introduced. No claim is made
  that every possible future SQL function or external writer is automatically
  covered. Migration ledger/content parity remains a separate release gate.
- The control does not manufacture approved owner openings, clear tenant debt,
  archive artifacts, change lease terms, reset balances, or remove history.

## Preconditions for a later controlled cutover

Monthly owner-close authority also checks billing completeness. Active and
notice-given positive-rent leases remain expected after a term expires; an expired
term is an unresolved continuation decision, not evidence that the tenant left.
Ended/terminated leases remain expected in months overlapped by their authoritative
terms. Draft, future-start and zero-rent leases do not manufacture a positive rent
invoice. Each expected lease needs exactly one issued invoice containing a rent
line. Missing/ambiguous invoices block readiness, closing and new publication.
The close fingerprint includes the expected lease, term, billing-rule and invoice
evidence. An empty reset baseline is inspectable but cannot certify a completed
October close until October billing is restored and all other close rules pass.

Tenant invoice/payment sources, owner close revisions/publications/artifacts, and
tenant artifact/attestation/cleanup rows carry database-owned generations. Existing
rows start at zero. After enrollment or generation advancement, old source IDs,
artifact downloads, publication resumes and Storage policy checks are unavailable
through the current-authority paths. Their rows and bytes remain retained evidence;
this candidate creates no historical archive browser or destructive cleanup path.
New-generation clients cannot turn an old invoice ID into a new current document.
Server-only upload attestation and cleanup calls must forward the captured intent
generation as well. Storage bytes still require separate retention/recovery proof.

1. Finish the exact target/dependency manifest and client coverage inventory.
   Prove every allowed write surface carries reviewed intent context, and reject
   or contain unsupported paths. Use a month-start authority boundary for the
   existing monthly owner period and invoice model; do not infer partial-month
   opening support from the control table's date type.
2. Obtain separate approval for the concrete destructive artifact and recovery
   plan. Verify current backup availability, retention, Auth/configuration and
   separate Storage-byte coverage. Rehearse isolated restore with inherited jobs
   and outgoing effects disabled. Whole-project recovery needs explicit approval
   for every affected organization and accepted post-checkpoint data loss.
3. Under the protected exact-main lane, enroll the approved target frozen and
   verify writer drain. Capture the final master/non-target identities and hashes,
   financial source inventory, queue state and recoverable checkpoint.
4. Execute only the separately reviewed one-time reset/archive/opening artifact.
   This candidate contains no such executor or bypass of immutable-source guards.
   Advance generation while still frozen, classify old command/journal identities,
   and prove no historical deferred item can consume newly entered cash.
5. Verify zero/opening authority, preserved contracts, access, reports and exports,
   artifact disposition and complete guard restoration before approved reopening.
   Refresh clients so their next explicitly reviewed intent captures the new
   generation. Re-enter October once and reconcile November rollforward.

If any phase fails or commit outcome is unknown, keep the organization contained
and inspect original operation identities before retrying. Do not drop controls,
rewind generation, disable triggers or repair migration history as a rollback.
Application rollback does not restore deleted data. Post-commit recovery follows
the separately approved restoration procedure and must preserve this lifecycle
boundary or prove compatible application and database behavior before reopening.

Generic financial disposition and remaining executor/recovery work are
recorded in [the execution review plan](pilot-october-2026-reset-execution-plan.md).
That plan is review material, not an installed maintenance capability.


Local preparation now includes the fixed-target `pilot-finance-reset-manifest.mjs`
read-only exact-row inventory and `pilot-finance-reset-recovery.mjs` database-clone
rehearsal. They bind candidate source/registry/migrations and the synthetic fixture;
they do not grant a frozen operator capability or execute financial removal. See
the execution plan for command boundaries, timeline/task/deposit normalization,
Storage exclusions and the remaining executor phases.
