# Private reset action foundation

This interface is inactive by default. It grants no application role a reset operation and does not certify known-zero balances, recovery, or production readiness. The synthetic clone adapter must separately prove database ownership/identity, review bindings, source stability, worker drainage, dependency order, business invariants, and recovery. No public RPC executes a reset.

All functions below are in `app_private`, callable only by the database owner. `PUBLIC`, `anon`, `authenticated`, and `service_role` have no table or function access. An ordinary owner connection without an armed exact action receives no guard exemption. No session setting authorizes reset writes.

For archived owner cash allocations and owner expense adjustments, exact restore authorization retains the existing invoice-derived owner scope, property validation, financial-month lock, and owner lifecycle lock in that order. Only those two INSERT trigger paths recognize the full-row restore capability. Ordinary writes continue through the unchanged financial write gate and remain rejected while frozen.

## Operation and archive contract

`prepare_financial_reset_operation(p_binding jsonb) returns uuid` accepts:

```json
{
  "operation_id": "UUID",
  "organization_id": "UUID",
  "operation_kind": "reset",
  "source_generation": 0,
  "target_generation": 1,
  "manifest_sha256": "64 lowercase hex characters",
  "plan_sha256": "64 lowercase hex characters",
  "schema_sha256": "64 lowercase hex characters",
  "archive_sha256": "64 lowercase hex characters",
  "action_sha256": "64 lowercase hex characters",
  "archive_count": 1,
  "action_count": 1,
  "audit_timestamp": "finite timestamptz",
  "audit_actor": null,
  "restore_of": null
}
```

The operation binds its current database OID/name, organization, source/target generation, exact hashes/counts, and audit recipe immutably. Archive/action/capability organization IDs are derived from the operation and enforced by composite foreign keys; they are not caller-supplied API parameters. Target generation must equal source generation plus one. A separate committed freeze/reservation must already leave the organization's financial control frozen at the target generation. The foundation never changes that control. Repeating an operation UUID with identical binding returns the existing operation; any different binding fails. A restore operation uses `operation_kind=restore` and `restore_of` naming the completed reset whose immutable archive it consumes.

`archive_financial_reset_rows(operation_id uuid, rows jsonb) returns void` accepts an array of `{relation_name, primary_key, row_text, row_sha256}`. `row_text` must be the original PostgreSQL `to_jsonb(row)::text`, not JSON serialized by JavaScript. The server requires its SHA256 to match, derives ordered primary keys from the catalog, verifies the full typed row and exact current stored row under the frozen organization, and stores the full immutable JSONB plus its canonical text hash. Duplicate keys fail. A restore operation consumes its original operation's archive; it must not recapture changed rows as originals.

`prepare_financial_reset_actions(operation_id uuid, actions jsonb) returns void` accepts an ordered array of:

```json
{
  "action_id": "UUID",
  "ordinal": 1,
  "relation_name": "public.example",
  "primary_key": {"id": "UUID"},
  "kind": "archive-delete",
  "before_row_text": "original PG JSONB text or null for INSERT",
  "after_row_text": null,
  "before_sha256": "hash or null for INSERT",
  "after_sha256": null
}
```

Kinds are `archive-delete`, `normalization`, and `restore`. The server type-canonicalizes proposed after-images using the actual table composite type and requires the supplied canonical hash to match. A materializer's unverified proposal hash is not accepted as a stored result. Normalization changes only explicitly enumerated financial projection/cycle fields and the explicit audit recipe. Unlisted fields remain equal. Pending maintenance reminders can only become cancelled when unclaimed and undelivered; their payload and other fields remain unchanged. Retained idempotency requests, category result seals and paid-cost registrations have archive-only rules and cannot be mutated or rebound by this API. Outbox cancellation is not reversed into executable old intent. Restore uses eligible archived values with only the new generation rebinding; cycle references may be staged null before a later exact restore UPDATE. There is no authority for newly invented opening-balance or other financial INSERTs.

Digest recipes use PostgreSQL JSONB canonical text, SHA256 encoded in lowercase hex. Archive digest hashes a JSONB array ordered by `relation_name, primary_key::text`, each element `{relation_name, primary_key, row_sha256}`. Action digest hashes an array ordered by ordinal, each element `{action_id, ordinal, relation_name, primary_key, kind, before_sha256, after_sha256}`. Empty arrays hash `[]`. Helpers `financial_reset_archive_digest(uuid)` and `financial_reset_action_digest(uuid)` return these values. Bind expected digests before preparation; sealing compares actual values, contiguous ordinals, full archive/action coverage, and exact per-row image chains. Archive-only historical-reference evidence may have no action.

Relation rules persist qualified names only, so dump/restore cannot silently retain another database's table OIDs. Each new operation resolves and binds its own archive/action relation OIDs; every row gate checks the live name-to-OID mapping. Existing operations remain bound to their original database OID/name and cannot be resumed on a logical copy. Recovery on a copy requires a newly reviewed operation and schema binding; original archived row values remain evidence, not executable old OID authority.

## Transaction and trigger contract

`seal_financial_reset_operation(uuid)` changes `prepared` to `sealed` after validation. `start_financial_reset_actions(uuid)` takes the lifecycle advisory lock and changes `sealed` to `executing`, binding the backend PID and top-level transaction ID. `arm_financial_reset_action(operation_id uuid, action_id uuid)` permits only the next unapplied action. The caller performs the exact typed DML; there is no generic SQL executor. UPDATE must name only columns whose values change, so unrelated `UPDATE OF` triggers do not fire.

The earliest BEFORE row gate is `000_financial_reset_row_action`, calling `begin_financial_reset_row_action()`. It enters one armed event. Existing guards and selected business-effect suppressors call `financial_reset_action_allowed(relation oid, verb text, old jsonb, new jsonb) returns boolean` repeatedly. With no capability it returns false. With an active capability, a wrong transaction, relation, verb, phase, frozen generation, scope, or full before/after image raises an exception. It never grants authority merely because `current_user` is `postgres`.

The final immediate AFTER row trigger is `zzzz_financial_reset_row_action_complete`, calling `finish_financial_reset_row_action()`. It verifies actual final images and consumes the action/capability exactly once. Three catalog-pinned stored generated columns are excluded from the BEFORE NEW projection because PostgreSQL has not computed them yet: `deposit_rent_allocations.signed_amount`, `tenant_invoice_payment_allocations.signed_amount`, and `expense_submissions.customer_total_amount`. INSERT/UPDATE DML must omit generated columns. Completion always checks the full actual AFTER hash, including these amounts; a mismatched generated value aborts the operation. Source revision/audit and deferred conservation checks remain active. A deferred constraint trigger rejects any unconsumed capability or unfinished executing operation at transaction completion. Statement failure/savepoint rollback roll back capability entry and consumption with the row write.

`complete_financial_reset_actions(uuid)` requires all actions consumed and no capability, then changes status to `actions_complete`. This status certifies only that this exact action sequence committed. It is not a known-zero or recovery result. `financial_reset_operation_status(uuid) returns jsonb` exposes immutable IDs/hashes, counts, generation and status to the private adapter for unknown-commit retry. A completed operation is not restarted or replayed. Restore is a new operation and generation.

The foundation migration installs metadata guards only. A following migration installs row gates and narrow integrations on the closed relation set. Runtime validation must cover that complete migration chain, trigger ordering, typed after-images, wrong scope/hash/action/transaction, role denial, savepoints, rollback, reuse, incomplete transaction rejection, and generation-aware restoration.

## Checked known-zero phase

The `20261023104000` migration supplies a private fixed-command phase. Forward migration `20261023112000` adds explicit known-zero support for archived properties without unarchiving them. The phase remains USD-only; a missing opening component is never treated as zero.

`financial_reset_known_zero_scope(operation_id uuid) returns jsonb` returns the complete ordered property/owner roster at the reserved cutoff, including archived properties. Missing, inactive, or invalid ownership fails. Each scope has `property_id`, `property_owner_id`, `owner_person_id`, `ownership_percent`, `ownership_roster_hash`, `currency` (`USD`), `property_row_sha256`, and `property_archived_at` (null for live properties). The property hash covers its entire PostgreSQL JSONB row. Any property or roster drift invalidates the plan. The private read-only `financial_reset_zero_scope_on_date` helper derives the same review shape before an operation is prepared; it grants no write authority.

`prepare_financial_reset_zero_plan(operation_id uuid, plan jsonb, review_sha256 text) returns void` must run while the operation is prepared or sealed, before deletion. The digest is SHA256 of the complete canonical PostgreSQL JSONB plan text. The plan has exactly these fields:

```json
{
  "operation_id": "reset operation UUID",
  "organization_id": "organization UUID",
  "manifest_sha256": "same manifest hash as reset operation",
  "reset_plan_sha256": "same action-plan hash as reset operation",
  "maker_actor_id": "explicit reviewed actor UUID",
  "reviewer_actor_id": "different explicit reviewed actor UUID",
  "effective_date": "reserved cutoff, first day of month",
  "currencies": ["USD"],
  "scopes": ["exact full array from financial_reset_known_zero_scope"]
}
```

Before executing actions, each named maker and reviewer must separately call `public.approve_financial_reset_zero_plan(operation_id, review_sha256)` from their own authenticated session after reviewing the complete plan. The RPC derives the actor from `auth.uid()`, verifies the exact immutable plan digest and ordinary property permissions, and retains immutable approval evidence. An operator-supplied pair of actor IDs is insufficient. The RPC authorizes only that plan; it does not execute a reset. Synthetic test approvals are explicitly test evidence and cannot stand in for customer approvals.

`apply_financial_reset_known_zero(operation_id uuid) returns jsonb` runs **after `complete_financial_reset_actions` and before the same transaction commits**. It requires both matching authenticated approvals, the same backend/top-level transaction, a frozen unchanged target generation/cutoff, no active row capability, and an empty financial removal set. It validates the exact roster again. Under the exclusive lifecycle lock it temporarily opens the control in the same transaction and calls the public submit/review commands under the endorsed identities for all four explicit zero components in every reviewed scope. These commands retain current maker/checker permissions, evidence, idempotency, actor separation, and approval/entry conservation checks. It uses the reviewed manifest reference and digest as source evidence; it creates no Storage document and fabricates no session or step-up assurance claims.

For each archived component only, `financial_reset_archived_zero_command_context` binds the current backend/transaction, database operation, generation, approved review digest, full property/owner scope, component and exact submit/review arguments. It permits only a zero initial request followed by its approved entry; amounts, corrections, alternate actors/scopes and arbitrary commands are rejected. No application role can create or invoke this private authority. The context must be consumed before commit and must be absent at every drained checkpoint. The normal roster validator, archived-property writes and archived owner-period generation remain closed outside this exact path. Archived scopes receive explicit opening authority; this does not make their operational reports ready.

The phase refreezes before returning and records exact stored request/entry row images and hashes in `financial_reset_zero_plans.result_json`. It reconciles all financial tables, explicit zero components, independent actors and new completed idempotency intents. Any command or postcondition failure rolls back the whole phase, including the temporary open. All touched identity, header, finance-branch and review-context settings are restored. Identical completed calls return the stored result without duplicating authority.

`record_financial_reset_phase_fence(operation_id uuid, phase text)` is a shared private finalizer for fixed `known-zero` and `continuation` phases. Call it only after phase postconditions and refreeze. Its immutable `financial_reset_phase_fences` record binds the operation, organization, backend/top-level transaction, generation and cutoff; a deferred constraint rejects a commit if the caller subsequently leaves the control open or changes its generation/cutoff. Continuation can require a complete matching `financial_reset_zero_plans` checkpoint. There is no generic callback, arbitrary SQL, or public reset permission.

Known-zero completion is a scoped owner-opening authority result. Tenant re-entry, billing completeness, report acceptance, rollback after new generated rows, and a verified recovery rehearsal remain separate requirements before actual reset readiness.

## Recovery after checked phases

Migration `20261023110000` adds a closed source derivation for recovery after known-zero and optional checked continuation/billing. It does not execute recovery. The restore is a new operation with `restore_of` pointing to the original reset and a newly reserved frozen generation. Its original archive count/digest remain those of the original reset; newly generated rows never replace the original archive.

`financial_reset_recovery_candidates(original_reset_operation_id uuid) returns jsonb` derives an array from completed, immutable phase outputs. Each element has `relation_name`, ordered `primary_key`, `kind`, full `before_row`, nullable `after_row`, `before_sha256`, nullable `after_sha256`, and `provenance`. The array is ordered by `relation_name, primary_key::text`. Its canonical PostgreSQL JSONB hash is `sources_sha256`.

`recovery-prune` applies only to exact rows created by the zero or continuation phase: the two owner opening authority tables, the closed billing output table set, and new lease terms/billing rules. A key present in the original archive cannot be pruned. `recovery-repair` only reverses an observed predecessor lease term transition from expired back to active, including its original audit fields. Other contract fields remain identical. Phase-created activity logs and completed idempotency intents remain byte-identical historical evidence; the fresh generation retires those intents. Existing audit evidence and the original archive are preserved.

`prepare_financial_reset_recovery(restore_operation_id uuid, phase_binding jsonb) returns void` requires exactly:

```json
{
  "continuation_after_sha256": "immutable phase result hash, or null",
  "continuation_before_sha256": "immutable phase result hash, or null",
  "continuation_review_sha256": "immutable phase plan hash, or null",
  "schema_sha256": "same reviewed schema hash as original reset and restore",
  "source_sha256": "hash of current financial_reset_continuation_snapshot(org)",
  "sources_sha256": "hash of the complete derived candidate array",
  "zero_authority_sha256": "immutable zero result authority_sha256",
  "zero_review_sha256": "immutable zero review_sha256"
}
```

All three continuation fields are null only when no continuation plan exists. An incomplete plan fails closed. With continuation, the current full organization snapshot must still equal its recorded after-image hash. Every recovery source must match the actual full current row. Identical preparation can be retried; a different binding for the same operation fails.

The private immutable tables are `financial_reset_recovery_plans` (operation/organization, original reset, exact phase binding and digest/count) and `financial_reset_recovery_sources` (operation/organization, relation/key, full before/after images and hashes, kind and provenance). Both are inaccessible to application roles. `financial_reset_recovery_source_rows(restore_operation_id uuid) returns jsonb` exports their ordered array with canonical `before_row_text` and nullable `after_row_text` in place of row JSON, avoiding JavaScript numeric reserialization.

The adapter orders exact generated-row deletions using current foreign keys and rejects outside incoming references or unresolved cycles. Predecessor contract repairs follow the deletions; original archive restores follow the repairs. It submits the two new kinds through the existing action preparation API. Sealing requires each derived source exactly once, an unchanged phase snapshot, and every restore-eligible original archive row's exact final image with the new generation. Existing row capabilities still bind backend, transaction, phase, relation, operation and full images. Lease term and billing rule generated `effective_range` values are omitted from DML and verified in the final full AFTER image. Migration `20261023111000` installs only their exact row gates and the specific contract catch-up suppression needed for an approved repair.

`actions_complete` still does not claim verified recovery. The owned-clone rehearsal must commit the checked phases, then recover in a later transaction, verify original archived images, absence of generated authority, repaired contract images, retained historical audit/idempotency bytes and frozen generation, and prove source database stability and clone cleanup. The focused SQL test covers classification and refusal boundaries without inventing completed journals; the multi-transaction positive proof belongs to that rehearsal.

The ordinary owner invoice generator consumes one invoice number per new owner invoice; several lease fees can share one invoice. The local rehearsal derives that count from immutable continuation images, checks the exact new invoice-number set and sequence advancement, and preserves the advanced counter on recovery. It restores archived invoice numbers explicitly and never rewinds a sequence. Every other counter and preserved row must still match exactly.

Report acceptance also requires the normal owner-event allocation and monthly-period generation commands. Zero opening authority alone does not populate stored monthly balance reports. The disposable rehearsal can exercise those ordinary authenticated commands and read the reports inside a separate transaction that is rolled back before recovery; this demonstrates operational behavior without claiming the frozen checkpoint already contains rebuilt periods.

## Local validation — 23 October 2026

The archived-property extension (`20261023112000`) passed clean replay, 45 focused archived-scope assertions, the full 173-file / 5,770-assertion database suite, 20 concurrency cases, 423 Node contracts, TypeScript and changed-script lint. The focused tests cover ordinary authenticated denial, exact context/actor/hash/roster binding, rollback cleanup, unchanged archived masters and recovery-source derivation. A customer operation additionally requires the full committed archived-scope recovery rehearsal, encrypted storage and target-specific file-byte recovery evidence.

### Preceding candidate recovery evidence

Before the archived-property extension, the source-bound synthetic rehearsal passed on an owned disposable clone: 644 archived rows, 472 reset actions and 532 restore actions. It verified 16 explicit zero components across four live owner scopes, five October tenant invoices and five fees, and three new owner invoice numbers with the advanced sequence retained. Recovery restored master records and full archived values with the required generation rebinding, retained historical evidence, and left generation 2 frozen. Injected failure rollback passed; the source database remained unchanged and the clone and dump were removed.

Report acceptance passed through actual report RPCs after ordinary allocation and period-generation commands in a separate transaction. That report probe was rolled back and its rollback verified; rebuilt report periods were not persisted in the recovered checkpoint. The accompanying local checks passed: 172 pgTAP files / 5,725 assertions, 20 concurrency cases, 422 contracts, TypeScript and lint.

This is local synthetic evidence bound to those preceding source files, not an archived-property, production-readiness or customer-approval claim. No hosted writes occurred. The separate holdover recovery proof belongs to an earlier source version and is not included in these results.
