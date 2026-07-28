# Plan 04 — Authoritative Lease Terms and Rent-Policy Contract

**Mode:** Standard
**Effort:** High
**Status:** Current authorized implementation slice.
**Baseline:** `main` at `64d72fcb545fa2feedebb05a2a261af23cc49bd6`, the merge commit for PR #37.
**Reason:** Future rent occurrence generation cannot be deterministic while compatibility lease columns can overwrite normalized terms and unresolved IPS rent rules are silently inferred.

## Prerequisites

- Plans 00 through 03 are merged and complete.
- `97-ratified-final-sequence.md` remains the final sequence and architecture authority.
- Plan 03 property-period locking, idempotency, reserved-projection, and privilege boundaries must remain intact.
- PR #38 is not a dependency and must not be stacked or cherry-picked. Its rent-policy defaults are unapproved placeholders.
- No hosted Supabase access, production migration, backfill, deployment, or merge is authorized by this plan.

## Repository-verified current behavior

- `leases` retains compatibility dates, monthly rent, currency, deposit, and lifecycle status.
- `lease_terms` stores normalized term dates, rent amount, currency, due day, payment frequency, sequence, and lifecycle status.
- `sync_lease_backbone_records` currently upserts term sequence 1 from `leases`, derives `rent_due_day` from the lease start date, and forces `payment_frequency = 'monthly'`.
- Checked `create_lease` and `update_lease` RPCs accept compatibility-level lease and monthly-rent inputs. Their writes activate the same compatibility-to-term synchronization.
- Lease list and summary loaders primarily read compatibility fields. The detail term loader does not expose the complete due-day, frequency, authority, policy, or readiness contract.
- Lease imports eventually call the compatibility `create_lease` RPC, so they inherit the same inferred due-day and monthly-frequency behavior.
- `generate_monthly_rent_income_items` reads compatibility `leases`, uses the first of the month as the due date, and charges the full monthly amount for overlapping active or notice leases.
- Existing normalized term rows and generated obligations may be compatibility-derived historical evidence. They cannot be relabeled as confirmed policy without an explicit operator decision.

## Objective

Complete one infrastructure and operational-readiness slice that:

1. makes normalized lease terms authoritative for rent terms;
2. makes compatibility rent fields deterministic projections for existing consumers;
3. introduces an organization-scoped, effective-dated, audited rent-policy version contract;
4. records unresolved IPS rules explicitly instead of inventing defaults;
5. resolves one applicable term or a typed blocker for a lease and date;
6. classifies each lease as ready, blocked, legacy-unconfirmed, conflicting, policy-unapproved, or unsupported;
7. routes checked lease, term, and import workflows through the same authority boundary; and
8. leaves charge occurrences and rent generation to Plan 09.

## Authority model

### Normalized terms are canonical

- `lease_terms` is the write authority for term dates, rent amount, currency, due day, frequency, and term lifecycle.
- `leases` compatibility dates and monthly-rent columns remain for current screens and reports but are projections, not independent write authority.
- Compatibility projection is deterministic: the lease row reflects the applicable confirmed authoritative term selected by the checked mutation transaction.
- A direct compatibility edit, stale client, generic RPC, import, or trigger cannot rewrite an authoritative term.
- Party, occupancy, and deposit backbone synchronization may remain where it does not reassert rent-term authority.
- Existing compatibility-derived terms remain `legacy_inferred` until explicitly confirmed or superseded.

### One deterministic term resolver

One organization-scoped database boundary resolves the applicable term for a lease and effective date. It returns exact organization, property, unit, lease, term, currency, and term-version identity plus the applicable effective range and economic fields when exactly one valid term exists, or one typed blocker when no safe authority exists.

It must not select the newest row to hide overlaps. It rejects or classifies:

- no authoritative term;
- overlapping applicable terms;
- organization, property, unit, lease, or currency mismatch;
- draft, upcoming, expired, terminated, superseded, archived, or legacy-inferred terms; and
- unsupported one-unit-per-lease assumptions.

Date boundaries are inclusive and deterministic. Adjacent terms may meet only when the earlier term ends before the later term begins.

### Checked term lifecycle

Admin-only, versioned RPCs provide the minimum lifecycle:

- create an initial authoritative term;
- safely correct a draft or unused future term;
- schedule a future rent change;
- supersede without deleting history;
- terminate or shorten with an explicit effective date;
- confirm or replace a legacy-inferred term; and
- return exact affected lease and term identities.

Every mutation validates organization/property/unit/lease/currency scope, rejects overlap, records previous and new values in activity history, and uses payload-bound idempotency where retries could create another term.

Once a term has dependent financial obligations, settlements, close evidence, or another material reference, its economic meaning is immutable. A correction creates a linked replacement or superseding record.

Material changes acquire the Plan 03 property-period authority in the documented order. Retroactive changes that intersect a locked or closed period fail.

## Rent-policy contract

Use an organization-scoped, effective-dated, append-only version model. Do not use a generic JSON settings registry as the authority.

Each version records:

- version number and exact organization identity;
- effective date;
- supported rent frequencies;
- rent-calculation timezone;
- due-day source and validation;
- short-month due-day behavior;
- lease-start and move-in proration rule;
- lease-end and move-out proration rule;
- notice-period charging rule;
- mid-period rent-change rule;
- concessions, rent-free periods, and waivers support state;
- `draft`, `approved`, `superseded`, or `retired` lifecycle; and
- creation, approval, supersession, and actor/timestamp audit metadata.

The following values are unresolved unless explicitly approved by IPS:

- actual-days versus 30-day proration;
- a default due day, including day 1;
- deriving due day from lease start;
- charge-through-lease-end versus charge-through-move-out;
- notice-period charging;
- concession, rent-free, or waiver handling; and
- non-monthly frequency support.

Draft versions may preserve unresolved fields. An incomplete version cannot be approved. Approved versions are immutable; corrections create a later version. A future version does not reinterpret historical terms or obligations.

## Readiness classification

One typed resolver classifies a lease/date using a small stable reason set:

- `ready`;
- `blocked`;
- `legacy_unconfirmed`;
- `term_conflict`;
- `policy_unapproved`;
- `unsupported_frequency`;
- `missing_due_day`;
- `policy_not_effective`;
- `scope_mismatch`; or
- `proration_rule_unresolved`.

Classification considers authoritative term availability and overlap; policy approval and effective date; due day, frequency, currency, and timezone; lease, occupancy, term, property, and unit dates; proration, notice, concession, rent-free, and waiver requirements; and legacy-inferred evidence.

Compatibility rent amount alone never makes a lease ready. The application receives exact term/policy identities and repair context.

## Application and import behavior

- Lease create/edit captures term start/end, amount, currency, due day, frequency, and intended term lifecycle explicitly.
- Due day is never silently derived from lease start.
- Unsupported frequency is never silently converted to monthly.
- Unresolved policy is shown as an operational blocker.
- Current table-first lease list, inspector, create/edit drawer, and compatibility displays remain usable.
- Imports must call the same checked term authority or fail with a precise blocker.
- Existing inferred rows are preserved, classified, and offered for explicit confirmation or replacement.
- No historical obligation, allocation, Ledger row, journal, deposit, or cash event is rewritten.

## Plan 09 boundary

Plan 04 must not add or redesign:

- `lease_charge_occurrences`;
- range or scheduled rent generation;
- catch-up generation;
- obligation-producing proration calculators;
- invoice approval or delivery;
- rent projections; or
- report or Owner Statement cutover.

`generate_monthly_rent_income_items` remains an explicitly documented legacy compatibility path. Plan 04 may add only a minimal guard needed to stop it from treating unresolved/new authoritative terms as safe. It is not made policy-correct in this slice.

## Invariants

- Organization, workspace, property, unit, lease, tenant, and term isolation.
- USD-only current behavior unless merged repository evidence changes it.
- Exact numeric money and stable typed identities.
- No overlapping authoritative term for one lease/date.
- Append-only or superseding historical corrections.
- Approved policy versions are immutable.
- Unconfirmed policy is blocked, not guessed.
- Compatibility fields are projections, not authority.
- No direct Data API, service-role, private-helper, generic-RPC, or import bypass.
- Plan 03 lock order and payload-bound idempotency are preserved.
- Current finance, close, report, and statement behavior is not cut over.

## Acceptance criteria

1. The Owner Close README identifies this file as the only executable Plan 04.
2. Legacy broad plan files point to the ratified sequence and cannot be mistaken for current prompts.
3. One deterministic boundary resolves exactly one term or one typed blocker.
4. Overlap and contradictory scope fail visibly, including under concurrency.
5. Due day is no longer inferred from lease start.
6. Compatibility lease edits cannot overwrite normalized term authority.
7. New lease creation creates an explicit authoritative term through a checked operation.
8. Material changes preserve term history.
9. Retroactive changes intersecting locked or closed periods fail.
10. Draft policy versions can retain unresolved rules without defaults.
11. Incomplete policy cannot be approved.
12. Approved policy cannot be updated in place.
13. Active/future leases receive one readiness classification and precise repair codes.
14. Legacy inferred terms remain unconfirmed until explicitly resolved.
15. Direct DML, wrong-scope, private-helper, generic-RPC, service-role, and import bypasses fail.
16. Retries cannot duplicate terms or policy versions.
17. Existing financial records are not rewritten.
18. No charge-occurrence table or new rent generator is introduced.
19. PR #38 is not included.

## Verification

### RED evidence

Demonstrate the current failure before implementation:

- compatibility rent changes overwrite `lease_terms`;
- due day is inferred from lease start;
- overlap lacks the new authoritative/race boundary;
- no approved-policy completeness boundary exists;
- API roles retain unintended direct term mutation;
- legacy inferred terms appear indistinguishable from confirmed terms;
- retroactive term changes do not use Plan 03 property-period authority;
- imports bypass explicit term input; and
- retries have no term/policy idempotency identity.

### GREEN evidence

- Focused Vitest for lease loaders, summaries, create/edit actions, readiness, policy validation, compatibility projection, imports, and UI.
- Local Supabase reset, schema lint, generated-type comparison, focused pgTAP, and full pgTAP.
- pgTAP for RLS, privileges, direct-DML/RPC bypass, overlap, policy lifecycle, legacy classification, activity, lock behavior, scope, and idempotency.
- Two-session concurrency proof for overlapping terms and term edits versus period authority.
- Forced-failure proof for atomic rollback.
- Full Vitest, ESLint, TypeScript, production build, and `git diff --check`.
- Authenticated Admin browser flow covering legacy readiness, draft policy, blocked approval, explicit term creation, future change, overlap rejection, compatibility display, and Manager/Member denial at desktop and mobile widths.
- Exact branch/remote parity at the final candidate.

## Scope exclusions

- No Plan 05 income settlement.
- No Plan 06 expense settlement.
- No Plans 07-08 maintenance or petty-cash cutover.
- No Plan 09 charge occurrence or rent generation.
- No deposit, management-fee, owner-balance, distribution, reconciliation, close, statement, or backfill implementation.
- No generic configuration platform and no PR #38 merge.
- No hosted migration, production mutation, deployment, or merge.

## Deliverables

- Corrected plan documentation and legacy mapping.
- Append-only migrations for term and rent-policy authority.
- Checked term/policy mutation and resolution boundaries.
- Compatibility projection and legacy classification.
- Updated lease loaders, actions, imports, and focused UI.
- Generated types and complete RED/GREEN evidence.
- PR #38 conflict/disposition report.
- Draft PR only.

## Stop conditions

Stop rather than guess if:

- latest `main` no longer contains Plan 03;
- a merged change introduces competing lease/configuration authority;
- safety requires destructive historical or financial rewrites;
- violations cannot be classified without fuzzy inference;
- IPS proration, due-day, notice, frequency, concession, or rent-free policy would need to be invented;
- material changes cannot follow Plan 03 locking;
- imports cannot share the checked boundary;
- overlap cannot be prevented under concurrency; or
- exact-head full verification fails.
