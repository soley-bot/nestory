# Plan 04 — Authoritative Lease Terms and Rent-Policy Contract

**Mode:** Standard
**Effort:** High
**Status:** Implemented and merged in PR #39 at
`b592557f3d2919ab5bd7932426fc218a1bea5d4d`.
**Baseline:** `main` at `64d72fcb545fa2feedebb05a2a261af23cc49bd6`, the merge commit for PR #37.
**Reason:** Future rent occurrence generation cannot be deterministic while compatibility lease columns can overwrite normalized terms and unresolved IPS rent rules are silently inferred.
**Current cross-reference:** Plan 09 still owns charge occurrences and
obligations. Current tenant invoice and formal receipt boundaries are in
`96-tenant-billing-reconciliation.md` and the unnumbered coordination files
`10-tenant-invoice-issuance-and-delivery.md` and
`11-formal-tenant-receipt-publication.md`. Those filenames are not ratified
Plan 10 or Plan 11 sequence authority.
**Track A/Track B reconciliation baseline:** merged `origin/main` at
`5210ae1c94fa5a854f9c484b79e9dbd214c99053`. The Plan 04 implementation
baseline above remains historical evidence; this later baseline records how
Plan 09 consumes the merged Lease and Occupancy History planning contract.

## Prerequisites

- Plans 00 through 03 are merged and complete.
- `97-ratified-final-sequence.md` remains the final sequence and architecture authority.
- Plan 03 property-period locking, idempotency, reserved-projection, and privilege boundaries must remain intact.
- PR #38 is not a dependency and must not be stacked or cherry-picked. Its rent-policy defaults are unapproved placeholders.
- The original implementation plan authorized no hosted Supabase access,
  production migration, backfill, deployment, or self-merge. This file now
  records merged Plan 04 evidence and does not authorize later work.

## Repository-verified current behavior

- `leases` retains compatibility dates, monthly rent, currency, deposit, and lifecycle status.
- `lease_terms` stores normalized term dates, rent amount, currency, due day, payment frequency, sequence, and lifecycle status.
- `sync_lease_backbone_records` currently upserts term sequence 1 from `leases`, derives `rent_due_day` from the lease start date, and forces `payment_frequency = 'monthly'`.
- Checked `create_lease` and `update_lease` RPCs accept compatibility-level lease and monthly-rent inputs. Their writes activate the same compatibility-to-term synchronization.
- Lease list and summary loaders primarily read compatibility fields. The detail term loader does not expose the complete due-day, frequency, authority, policy, or readiness contract.
- Lease imports eventually call the compatibility `create_lease` RPC, so they inherit the same inferred due-day and monthly-frequency behavior.
- `generate_monthly_rent_income_items` reads compatibility `leases`, uses the first of the month as the due date, and charges the full monthly amount for overlapping active or notice leases.
- Existing normalized term rows and generated obligations may be compatibility-derived historical evidence. They cannot be relabeled as confirmed policy without an explicit operator decision.
- The implemented `resolve_lease_rent_readiness(...)` is a current
  term/policy-readiness boundary. It evaluates current Lease state and
  active/upcoming authoritative terms; it is not a historical
  as-of-service-date occurrence resolver and cannot by itself authorize
  catch-up generation for an ended, cancelled, terminated, archived, replaced,
  or transferred Lease.

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

### Historical as-of-service-date resolver

Before Plan 09 generates or corrects an occurrence, Track A must add a checked
historical resolver that:

- receives the organization, exact Lease, requested service date/range, and
  the versioned Track B relationship-evidence envelope;
- resolves the applicable authoritative `lease_term_id` and approved
  rent-policy version for that service date without treating today's Lease
  status as historical authority;
- treats Track B actual, scheduled, notice, party, occupancy, participant,
  boundary, confidence, resolution, reason, and material-hash output only as
  evidence candidates;
- applies the Track A-owned term/policy precedence, selected obligor/recipient
  rules, calculation start/end, due date, proration/notice treatment, blockers,
  and calculation reason codes;
- returns and later stores one Track A-approved calculation snapshot/hash that
  names every selected or ignored Track B source/version and why; and
- fails closed when the evidence or owner adapter is missing/conflicting,
  including when a `billing_contact` is present without independent debtor
  authority.

Track B does not select the applicable term, decide legal debt, apply a rent
policy, or calculate a financial date. Plan 04's checked term lifecycle remains
the only term-mutation authority. Any term supersession that can affect an
occurrence asks the merged Track A owner adapter for typed affected
occurrence/draft identities, owner-classified states/actions, and every
property/currency/period scope. A composed executor acquires those scopes in
the owner's deterministic order inside the same transaction before either
track writes.

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

1. At implementation time, the Owner Close README identified this file as the
   only executable Plan 04; the current README now records it as merged.
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

## Implemented evidence and operational assessment

The candidate implements the ratified slice without hosted access, production
mutation, deployment, merge, charge occurrences, or settlement cutover.

- Migration:
  `20260728120841_authoritative_lease_terms_and_rent_policy.sql`.
- Focused Plan 04 pgTAP: 70/70 assertions across the schema, policy, and
  behavior suites.
- Full pgTAP: 25/25 files and 854/854 assertions on a clean disposable reset
  and seed.
- Database lint: zero findings in `public` and `app_private`; freshly generated
  TypeScript database types match the committed file.
- Application: 1,304/1,304 Vitest assertions across 166 files; UI route
  coverage 54/54; ESLint, TypeScript, production build, and diff checks pass.
- Concurrency: the Plan 03 Ledger and accounting harnesses pass; the Plan 04
  harness passes three consecutive runs, proving same-lease overlap waits then
  fails closed, a period transition serializes and rejects a material edit,
  and unrelated properties remain concurrent. Forced checked-create failure
  leaves no compatibility lease row.
- Browser: an Admin saved an unresolved draft, was blocked from incomplete
  approval, completed and approved the explicit policy, created a checked
  authoritative lease, scheduled a future term without replacing active-term
  identity, and received a precise error for a second overlapping term. The
  post-error database state retained one shortened active term and one linked
  upcoming term. Seeded Manager and Member accounts both reached
  `/no-access`; anonymous access reached `/login`. Policy and lease screens had
  no horizontal overflow at 1440x900, 1024x768, or 390x844.

### Compatibility and migration-lock assessment

- Existing economic values are not rewritten as confirmed. Pre-existing rows
  are labeled `legacy_inferred`; their due day remains unresolved, and they
  require checked confirmation or replacement.
- `leases` date/rent fields remain compatibility displays. Only the checked
  term transaction may project an exact authoritative term to them.
- Material term and policy operations acquire Plan 03 property-period
  authority for every affected month in stable order. Long terms therefore
  create or lock one reporting-period header per intersected month; this is an
  intentional correctness cost and should be measured on production-shaped
  data before hosted application.
- Adding the generated effective range and GiST exclusion constraint requires
  table/index locks while the migration runs. Enabling `btree_gist`, validating
  the authoritative-range constraint, and replacing RPC definitions should be
  scheduled in a bounded maintenance window after a production-data diagnostic.
- No compatibility column is removed, no historical obligation or cash record
  is changed, and the legacy generator fails closed until Plan 09 consumes the
  resolved term and policy identities.

### PR #38 disposition

At the current planning baseline, PR #38 remains open, non-draft,
catalogue-only, and changes-requested. It was not merged into Plan 04 and is not
runtime authority. Plan 04's normalized, effective-dated policy remains the
sole proration/due-day authority. The current disposition for PR #38 invoice,
delivery, timezone/currency, and proration entries is in
`96-tenant-billing-reconciliation.md`; that later record supersedes the former
post-Plan-04 rebase wording.

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

## Required Cross-Plan Amendments

This merged Plan 04 record does not authorize Track B changes. Current
amendment detail is authoritative in
`96-tenant-billing-reconciliation.md`.

| Target planning package | Target concept/file | Repository evidence | Required decision or wording | Reason | Blocks this track? | Can wait for reconciliation? |
|---|---|---|---|---|---|---|
| Track B — Lease and Occupancy History | Checked relationship/date evidence consumed by Track A's historical service-date resolver | Plan 04 provides exact term/policy identity and blocks legacy generation, while the implemented readiness RPC is current-state oriented and Track B owns accepted relationship/date versions | Return exact accepted party/Person/occupancy/participant/notice candidates, boundary/confidence/resolution/reasons, source versions, and material hash. Do not select the term, obligor/recipient, calculation dates, due date, proration, blockers, or calculation snapshot | Plan 09 needs reproducible historical evidence without transferring term/policy or financial-calculation authority | No; Plan 04 is merged. Yes before Plan 09 generation | No once Plan 09 is enabled |
| Track A Plan 09 and financial owners | Historical calculation snapshot, owner adapters, and same-transaction locks | A term/party/occupancy supersession can affect occurrences and downstream drafts | Track A selects the authoritative term/policy and evidence, stores calculation dates/reasons/hash, returns typed owner states/actions/scopes through its adapter, and acquires all deterministic property-period locks before mutation | Prevents current Lease state or Track B code from becoming financial authority | No for merged Plan 04; yes for Plan 09 and affected transitions | No for the enabled path |
