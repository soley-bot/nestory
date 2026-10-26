# Private reset continuation and billing phase

The candidate `20261023105000` migration adds private operator functions only. It does not enroll, open, continue, bill or reset any organization during migration application. Hosted execution remains outside this local synthetic rehearsal.

The phase follows the checked known-zero checkpoint in the **same transaction** as the reset actions. It takes the exclusive organization lifecycle lock, validates the complete reviewed source and lease roster, opens the control only within its uncommitted transaction, invokes unchanged checked continuation and rent commands, verifies their complete persisted write set, and refreezes before returning. A deferred phase fence rejects a commit that leaves the control open or changes its generation/cutoff. Other backends see the committed frozen state or wait on the lifecycle lock.

Keep the phase control constraint deferred while executing successive private phases. If a caller forces that constraint immediate before continuation, the temporary open is rejected because the earlier known-zero fence is already present. This is a fail-closed restriction; no guard is bypassed. Every later control update also schedules the check, so flushing earlier deferred events cannot permit an unchecked reopen.

## Review and execution contract

Call `app_private.prepare_financial_reset_continuation(operation_id, plan_json, review_sha256)`, then `app_private.apply_financial_reset_continuation(operation_id)`. Neither function is granted to application or service roles. The current `auth.uid()` must equal the reviewed super-admin actor; the helper does not impersonate an actor or manufacture session assurance. Existing command permissions and trigger checks remain active. It temporarily supplies the reserved generation header and restores the original header and rent contexts on success; transaction rollback restores them on failure.

The version-1 plan has exactly these keys:

| Key | Meaning |
| --- | --- |
| `version` | `1` |
| `actor_id` | Reviewed existing super-admin actor |
| `billing_period_start` | Frozen control cutoff, equal to the first day of the current organization business month |
| `issue_date` | Current organization rent business date |
| `source_sha256` | PostgreSQL JSONB SHA-256 of `financial_reset_continuation_snapshot(organization_id)` after known-zero completion |
| `leases` | Complete active and notice-given, unarchived lease roster, including leases requiring no continuation and zero-rent leases |

Each lease object has exactly `lease_id`, `term_id`, `billing_rule_id`, `continue_month_to_month`, `rent_amount`, `management_fee_amount`, `currency`, `recipient_person_id`, `collection_route`, and `due_date`. Current support is USD, compatible with existing checked opening/billing commands. Existing zero-rent contracts are explicit roster entries and create no positive invoice. A zero-rent contractual continuation is not currently supported by the normal generator and is rejected at preparation.

Forward migration `20261023112000` also rejects an active or notice-given unarchived lease whose property is archived. Such a lease must not be silently omitted from the approved billing roster. Archived properties with only archived or terminal leases may receive reviewed zero opening components, while remaining outside ordinary operational-period generation. The rehearsal records their explicit zero authority and unchanged master rows separately from active-property report acceptance.

The unchanged continuation command automatically catches up the current business month. Preparation rejects a different cutoff month or backdated issue date before recording the phase; execution checks the clock again before any business writes. The October 2026 restart therefore remains an October plan and can execute during October. A delayed October restart in November or later is unsupported and fails closed; changing its reviewed period to a later month would be a different reset, not a workaround.

The review hash covers the exact canonical PostgreSQL JSONB plan. An offline semantic approval and a post-checkpoint source binding are different evidence: the adapter must report both hashes and must not claim that random newly generated identities were reviewed before execution. No arbitrary SQL, callback or RPC name is accepted.

## Output and recovery evidence

`app_private.financial_reset_continuation_plans` retains immutable plan and result evidence. `before_images` and `after_images` contain full sorted row images for every organization-scoped public/private table, excluding reset journals, control bookkeeping and report revision bookkeeping. The result contains lease/term/rule/invoice IDs, the reserved generation, and before/after hashes. A completed retry returns the same result without invoking the commands again.

Only planned continuation terms/rules, the predecessor active-to-expired status/audit update, the reviewed current month's rent/fee authority, its audit rows, resolved generation exceptions and new completed command intents are allowed. Master data, cash, deposits, historical intents and known-zero opening evidence must remain unchanged. Current normal catch-up can record a temporary missing-term exception before the new term exists; only a final resolved exception linked to the exact resulting invoice is accepted. Missing/extra invoices, amount/recipient/fee mismatches and unexpected persisted side effects abort the entire phase.

Recovery must account for more than financial rows: remove or explicitly retire the exact newly created continuation term/rule pair, restore the predecessor's original status/audit image through reviewed recovery authority, and retain new audit/idempotency evidence as retired history. The before/after images provide those identities; they do not themselves authorize inverse writes. This phase does not claim that post-billing recovery or final reopening has been proved.
