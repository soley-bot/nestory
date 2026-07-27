# Plan 06 — Rent Schedules and Charge Completeness

**Mode:** Standard  
**Effort:** High  
**Reason:** Outstanding balances and Owner Statements cannot be trusted while expected rent depends on an operator remembering to generate the current month manually.

## Context and baseline

Planning baseline is `main` at `823deb4735b8124edefd1e68e451c21f1962b075`. Begin after Plans 00-02; merge after the settlement plans unless Ultra approves an isolated branch with no overlapping migrations.

Current lease terms store dates, rent amount, due day, and payment frequency. The implemented rent-generation action generates the current month, uses month start, and charges the full monthly amount for any overlapping active/notice lease. There is no persisted expected occurrence, schedule version, automatic catch-up, explicit waiver, proration policy, or close blocker for a missing charge.

## Objective

Create deterministic expected rent occurrences and idempotent charge generation so every supported lease-period either has the correct charge or an explicit reviewed exception. Replace “no charge row exists” with a verifiable completeness state.

## Verified current behavior

- Leases have normalized parties, terms, occupancies, and deposits while retaining compatibility columns.
- Monthly rent charge generation is idempotent for the current implementation.
- `finance_income_items` is the existing rent obligation table.
- Owner Statement arrears facts depend on generated income obligations and receipt allocations.
- Missing obligations currently look like zero due.
- Payment frequencies richer than monthly may exist in schema even though generation acts monthly.

## Required changes

### 1. Document and enforce the initial IPS rent policy

Before implementation, record:

- supported payment frequencies for the October scope;
- rent due-day behavior when a month is shorter than the configured day;
- move-in and move-out proration method;
- whether notice status continues charging and until what date;
- rent-free periods, concessions, discounts, or waived charges required for IPS;
- effective rent-change rules;
- timezone used for scheduled generation.

The recommended initial release supports monthly leases only unless IPS has an immediate non-monthly requirement. Unsupported frequencies must become explicit blockers, not silent monthly charges.

### 2. Add expected charge occurrences

Create an organization-scoped table, provisionally `lease_charge_occurrences`, containing:

- organization, property, unit, lease, and applicable `lease_term_id`;
- period start and due date;
- charge type, initially rent and only additional types explicitly required by IPS;
- expected amount and currency;
- proration inputs and calculation snapshot;
- status such as expected, generated, waived, cancelled, or blocked;
- generated `finance_income_item_id` when present;
- waiver/cancellation reason and actor;
- schedule/calculation version;
- created/updated audit metadata;
- unique active occurrence per lease, period, and charge type.

The occurrence proves what should happen. The finance income item remains the obligation that can be settled.

### 3. Build a deterministic range generator

Create a checked, idempotent RPC that accepts organization and bounded period range and:

1. selects eligible leases/terms using authoritative dates/status;
2. calculates expected occurrences using the approved policy;
3. inserts missing occurrences;
4. creates missing rent obligations from expected occurrences;
5. links each obligation reciprocally;
6. preserves existing valid obligations rather than duplicating them;
7. reports conflicts when an existing obligation differs in amount, due date, lease, property, unit, or currency;
8. never silently modifies a settled obligation.

The generator must support catch-up for a selected month/range. A scheduled job may call the same RPC, but close-time catch-up and completeness checks remain mandatory.

### 4. Use the authoritative lease term

Do not calculate from duplicated compatibility fields when a normalized active lease term exists. Define one authority and tests for synchronization during the transition.

The calculation must handle:

- lease starts before, on, or after the period start;
- lease ends or moves out during the period;
- notice status;
- due day;
- approved proration;
- an effective rent change;
- archived/voided leases and terms;
- one unit only, unless multi-unit lease support is explicitly implemented.

### 5. Add explicit exception outcomes

An expected occurrence can be waived/cancelled only through a checked action with reason, actor, and activity history. Unsupported or ambiguous lease data creates a blocked occurrence with a repair link.

Do not represent a waived charge by deleting an obligation or entering zero rent.

### 6. Replace manual current-month dependency

Update Leases and Rent & Income so operators see:

- expected, generated, waived, and blocked occurrences for the selected month;
- a safe Generate/catch up action for a bounded period;
- exact blockers and links to repair lease terms;
- duplicate/conflict warnings;
- source occurrence on each generated rent obligation.

The primary workflow should not depend on visiting each lease. A property/month close must be able to generate/check all eligible leases.

### 7. Feed readiness and arrears

`property_cash_events_v1` continues using receipt allocations for cash. Charge occurrences provide completeness and expected-obligation evidence.

Owner Close must later distinguish:

- no eligible rent occurrence;
- expected and generated;
- expected but waived;
- blocked/missing;
- generated but unpaid/partially paid.

Outstanding balance remains obligation minus net receipt allocations; it is no longer inferred from the mere presence or absence of a row.

## Invariants to preserve

- One expected occurrence per supported lease-period-charge type.
- One linked rent obligation per generated occurrence.
- Generator is idempotent across retries and concurrent runs.
- Existing settled obligations are never silently changed.
- Due date and proration follow documented IPS policy.
- Unsupported lease frequencies or ambiguous terms fail visibly.
- Waiver/cancellation is explicit and audited.
- Charge date and cash receipt date remain separate.
- Cross-organization/property/unit/lease mismatches fail.

## Acceptance criteria

1. Every eligible monthly lease in a selected period has one generated, waived, cancelled, or blocked occurrence.
2. Re-running range generation creates no duplicate occurrence or obligation.
3. Concurrent generation remains unique and deterministic.
4. Due day is respected, including short months.
5. Approved proration examples calculate exact expected amounts.
6. A mid-period start/end, notice lease, rent change, archived lease, and unsupported frequency each produce the documented outcome.
7. Existing mismatched or manually created rent obligations surface as conflicts and are not silently overwritten.
8. Missing charge occurrences block readiness.
9. A zero-charge/no-eligible result can be distinguished from a missing-generation defect.
10. Generated rent obligations settle correctly through Plan 03 and appear once in canonical cash reporting.

## Verification

- RED regression proving a missing Generate rent action can produce a false zero balance/readiness state.
- pgTAP for occurrence uniqueness, concurrent idempotency, policy calculations, scope/RLS, term authority, conflict handling, waiver audit, and direct-RPC bypass.
- Vitest for calculation helpers, actions, filters, occurrence states, and error copy.
- Full application tests, lint, TypeScript, and build.
- Database reset, lint, generated types, and full pgTAP.
- Authenticated browser flow across selected month/range: generate → inspect obligation → record receipt → inspect outstanding/readiness.
- Timezone/date-boundary tests for Asia/Phnom_Penh.
- `git diff --check`.

## Scope exclusions

- No generic recurring billing engine.
- No every-country proration convention.
- No automatic late-fee engine unless IPS confirms it is required for October.
- No multi-currency or multi-unit lease expansion.
- No owner close or statement publication yet.
- No production historical occurrence backfill; Plan 12 owns it.

## Deliverables

- Approved IPS rent-policy decision record.
- Append-only migration for charge occurrences and links.
- Idempotent range-generation RPC and calculation module.
- Updated lease/rent-income loaders, actions, and focused UI.
- Readiness contract for generated/waived/blocked occurrences.
- Full tests and generated types.
- Draft PR; do not merge without review.

## Stop conditions

Stop if:

- IPS proration or supported frequency rules remain necessary but undocumented;
- the generator still treats every overlapping lease as a full monthly charge without policy;
- charge completeness is inferred only from `finance_income_items`;
- retries or concurrent runs can duplicate obligations;
- existing settled obligations would need destructive rewrite; or
- lease authority remains ambiguous between compatibility fields and normalized terms.
