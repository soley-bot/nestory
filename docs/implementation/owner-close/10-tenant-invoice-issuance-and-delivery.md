# Tenant Invoice Issuance and Delivery — Unnumbered Coordination Slice

> **Coordination status:** The filename is retained for stable links, but this
> is not ratified Owner Close Plan 10. Ratified Plan 10 remains
> security-deposit custody. This is a prominent unnumbered Track A coordination
> slice whose implementation still requires a separate approved prompt.

**Status:** Planned unnumbered coordination slice. Implementation begins only
after the prerequisites and named IPS/Track B gates below are resolved.
**Mode:** Standard
**Effort:** High
**Reason:** A tenant-facing demand needs immutable source lines, recipient and
policy snapshots, capability-based approval, a unique number, retained bytes,
and delivery evidence without becoming obligation or cash authority.
**Planning/reconciliation baseline:** merged `origin/main` at
`5210ae1c94fa5a854f9c484b79e9dbd214c99053`, containing the merged Track B
planning package.
**Original repository audit baseline:**
`2dea9fb71a539e01ee81b4601f8965fb62a681d5`; retain it for the verified
no-invoice runtime evidence below.

## Context and baseline

Plan 04 supplies authoritative lease terms and effective-dated rent policy.
Plan 09 will create an exact charge occurrence and one linked income
obligation. Plan 05 makes later receipt allocations and projections atomic.

The merged baseline has no tenant invoice entity, invoice lines, invoice
number, approval/issuance lifecycle, retained artifact, or delivery history.
`finance_income_items` is an obligation. `/invoices` currently redirects to
outgoing vendor Bills & Expenses. PR #38 is catalogue-only and does not
activate invoice approval or delivery.

This coordination slice owns tenant invoice authority only. It does not create charge
occurrences, obligations, cash, formal receipt documents, Ledger/journal
projections, or Owner Statements.

The merged Track B package owns accepted relationship/date evidence, not the
invoice debtor, recipient, or calculation decision. This coordination slice consumes the
Track A-approved Plan 09 occurrence snapshot that names the exact Track B
evidence used. It never asks Track B to select a debtor or silently treats a
`billing_contact` as one.

## Objective

For one eligible Plan 09 occurrence/obligation, provide this checked lifecycle:

```text
generated draft
-> submitted for review
-> reviewed
-> approved
-> issuance started
-> issued with immutable retained artifact
-> manual or configured delivery attempts
```

Approval, issuance, delivery, and settlement are separate facts. Issuance
never creates a second obligation. Delivery never proves payment. Receipt
allocations alone determine unpaid/partially-paid/paid presentation.

## Verified current behavior

- `finance_income_items` stores amount due/received, due/received dates,
  currency, payer/category, status, scope, and compatibility Ledger linkage. It
  has no invoice identity, lines, recipient snapshot, issue date, or artifact.
- `finance_receipts` and allocations settle obligations but have no invoice
  line link.
- Plan 04 stores normalized lease terms and approved rent-policy versions and
  blocks the legacy generator until Plan 09 consumes exact identities.
- Current Rent & Income screens can create manual obligations from
  compatibility lease rent values; those rows do not prove a Plan 04
  term/policy or Plan 09 occurrence.
- Generic document storage is private and supports signed reads, but the
  current document action can replace bytes and remove the old object.
- Report PDFs are rendered from live data on request and are not retained,
  versioned, or checksummed.
- Person/contact records can contain billing, email, or Telegram contact
  details, but the product has no general billing-delivery provider.
- `/invoices` query-preservingly redirects to `/bills-expenses`; the redirect
  is covered by `src/app/legacy-redirects.test.ts`.
- PR #38 remains open with changes requested. Its registry is explicitly
  catalogue-only; its proposed roles/defaults do not match current runtime
  authority and must not be consumed.

Primary evidence:

- `supabase/migrations/20260706113000_finance_income_expense_workflows.sql`
- `supabase/migrations/20260728120841_authoritative_lease_terms_and_rent_policy.sql`
- `src/features/rent-income/actions.ts`
- `src/features/rent-income/data/rent-income.ts`
- `src/features/documents/actions.ts`
- `src/features/documents/data/documents.ts`
- `src/features/reports/data/pdf.ts`
- `src/app/(dashboard)/invoices/page.tsx`
- `src/app/legacy-redirects.test.ts`
- `docs/current-state.md`
- `96-tenant-billing-reconciliation.md`

## Prerequisites and decision gates

Implementation requires:

1. merged Plan 05 settlement source identities and projection guards;
2. merged Plan 09 occurrence and obligation generation with exact Plan 04
   term/policy/calculation snapshots;
3. merged TB-05 period-effective relationship-evidence envelope, including
   exact accepted source IDs/versions, resolution states, reasons, and
   material hash;
4. merged Plan 09 Track A selection/calculation that chooses the debtor and
   recipient, applies Plan 04 policy, stores the approved calculation snapshot,
   and exposes a versioned owner-state adapter;
5. approved invoice-series format and reset policy;
6. approved capability for review/approval/issuance;
7. accepted October rule of manual review and approval;
8. accepted manual retained delivery for the pilot; and
9. confirmation that this is an operational invoice, with no invented
   tax-invoice claim.

If IPS requires tax/VAT or statutory invoice content, stop and create a
separate approved legal/tax decision before implementation.

## Required changes

### 1. Add a first-class invoice authority

Create organization-scoped entities for:

- invoice header and immutable issued version;
- ordered invoice lines;
- append-only lifecycle events;
- invoice document-series allocation;
- immutable artifact identity and checksum; and
- append-only delivery attempts/outcomes.

Names may follow repository conventions, but they must not reuse
`finance_income_items`, generic `documents`, Ledger rows, or Owner Statement
versions as invoice authority.

The stable internal invoice ID exists at draft generation. Each line always
retains the exact income-obligation ID and uses exactly one reviewed source
variant:

- normal new business: exact Plan 09 charge-occurrence ID; or
- later ratified Plan 20 migration: exact migration-manifest item ID plus typed
  `occurrence_not_historically_created`, never a fabricated occurrence.

Each line also retains:

- charge type and description;
- service/billing period;
- quantity/rate/proration calculation snapshot where applicable;
- exact line amount and currency; and
- for normal new business, exact source term and rent-policy version identities;
  or, for the Plan 20 migration variant only, the exact manifest item and typed
  historical-authority absence for any occurrence, term, or policy identity
  that was never created or cannot be proven. Migration must never fabricate
  those identities.

For normal new business, each line additionally freezes:

- the Plan 09-selected debtor and recipient party/Person identities, plus this
  slice's approved issue-time contact/address/delivery snapshot for that
  already-selected recipient;
- the exact accepted Track B party/Person/occupancy/participant/notice source
  IDs and versions consumed by Plan 09, their resolution/reason codes, resolver
  version, and material relationship-evidence hash; and
- the Plan 09-approved calculation snapshot/hash: service/calculation dates,
  due date, proration/notice basis, policy version, blockers resolved, selected
  versus ignored evidence, and calculation reason codes.

Track B evidence may supply a `billing_contact` candidate, but that role never
establishes contractual debt. Plan 09 owns both debtor and recipient identity
selection. This coordination slice only approves and freezes issue-time
contact/address/delivery evidence for the already-selected recipient and blocks
when it is missing, conflicting, or points to a different recipient identity.

The safe MVP has exactly one line bound to one obligation. A partial uniqueness
rule permits at most one active/current invoice for that obligation while
retaining a linked historical chain of cancelled/superseded invoices and
replacements.

### 2. Generate a reviewed draft, not an automatic invoice

A payload-idempotent checked command generates one draft from one eligible
occurrence/obligation. It rejects:

- manual/legacy obligations on the normal tenant-invoice path;
- missing or blocked occurrence outcomes;
- source scope/currency mismatch;
- an existing active invoice;
- void/archived obligations;
- any valid receipt already allocated under the normal new-business path; and
- unresolved Track B relationship evidence or an unresolved Track A
  debtor/recipient decision.

`generated` is the append-only event that creates the initial `draft`; it is
not a second persisted lifecycle state. Draft generation snapshots source
values for review but does not allocate a
public invoice number, create cash, post Ledger/journals, or send anything.
Draft regeneration is a checked append-only event. It may replace the current
draft candidate before approval while retaining earlier hashes and actors.

Ratified Plan 20 may later call a separate checked migration-invoice entry point for an
open legacy obligation named by the reviewed manifest. That path uses the real
current issue date, migration disclosure, exact obligation/manifest links, and
the typed occurrence absence above. It never attaches a new invoice to already
settled legacy cash. Under the shared obligation/property-period lock it reads
the exact signed allocation/reversal set and freezes the then-current net open
balance as the migration-invoice line amount. Prior allocations remain
obligation cash and `legacy_cash_non_publishable`; they count once toward the
obligation balance but never become settlement against the migration invoice.
It can support a later Plan 05 payment only after the migration invoice is
issued and that new allocation stores its exact invoice
header/version/line with `eligible_invoice_linked`.

Migration-invoice issuance and reversal of any historical allocation used in
its open-balance calculation share the same obligation/invoice/property-period
locks. Reversal committing first changes the signed source set and the draft or
issuance command must use the new net balance. Issuance committing first keeps
its economics immutable; a later exact historical-cash reversal remains
`legacy_cash_non_publishable` and makes the invoice owner return
`migration_invoice_replacement_required` until a checked cancellation/
replacement can use the changed balance. It never rewrites the invoice or
blocks the cash authority from retaining the exact reversal.

### 3. Separate lifecycle, delivery, and settlement axes

Persist the economic lifecycle independently:

| From | Command and required evidence | To |
|---|---|---|
| none | Generate from one eligible occurrence/obligation | `draft` |
| `draft` | Submit with complete recipient/source validation | `pending_review` |
| `pending_review` | Record capability-based review with actor, timestamp, findings/confirmation, and payload hash | `reviewed` |
| `reviewed` | Record capability-based approval with actor, timestamp, policy/version, and the same current payload hash | `approved` |
| `approved` | Begin checked issuance and reserve immutable snapshot/number/artifact identity | `issuing` |
| `issuing` | Finalize retained checksum-verified artifact | `issued` |
| `issuing` | Capability-based abandonment after unrecoverable/rejected publication, retaining reserved number, frozen snapshot, actor, and reason | `issuance_abandoned` |
| unpaid `issued` | Append cancellation reason | `cancelled` |
| `cancelled` | Issue a separately reviewed replacement | Original displays `superseded`; replacement is a new invoice |

Delivery states are `not_requested`, `pending`, `sent`, `delivered`, and
`failed`, based only on attempts/outcomes.

Settlement states are `unpaid`, `partially_paid`, and `paid`, derived only from
valid Plan 05 `invoice_bound` allocations/reversals that freeze this exact
invoice header/version/line. Reversal of such an allocation may move a display
from paid to partially paid or unpaid without altering the invoice. Other valid
obligation cash changes obligation outstanding but never this invoice status.

`sent`, `delivered`, `partially_paid`, and `paid` never substitute for
approval/issuance state.

Review and approval are separate auditable events. They may use the same actor
only if an approved capability policy permits it; this coordination slice does not invent
separation-of-duties.

`credited` is not a safe-MVP lifecycle state. A later implementation may show
partially or fully credited only as a derivation from an approved immutable
credit-note source; this coordination slice does not invent that source.

### 4. Use capability-based manual approval for the pilot

Approval and issuance require checked database commands and current
organization capability. Do not hard-code an IPS staff member or rely only on
a UI role label.

The October pilot requires a deliberate manual review and approval record even
if a future effective-dated billing policy permits a narrower auto-approval
case. Direct table DML, service-role access, generic RPCs, and generic document
actions cannot bypass:

- source and recipient readiness;
- source payload hash comparison;
- actor capability;
- approved policy/series version;
- property-period authority; or
- existing invoice/receipt state.

Approval is invalidated by any material draft/source/recipient change and must
be repeated.

This coordination slice exposes a versioned read-only owner adapter for exact invoice/version/
line identities, material lifecycle state, property/currency/period scopes,
and only owner-declared checked actions. A relationship-impact preview may
transport this opaque result but never infer it from invoice columns. An
`approved_not_issued` invoice permits only the merged tenant-invoice owner
`reset_approval` or `reopen` action followed by owner-controlled
regeneration/review; if that action is absent, the known state is preserved and
the action is unavailable.

Any composed correction resolves all affected source and destination scopes,
acquires every Plan 03 property-period lock in the owner-defined deterministic
order inside the same transaction, rechecks the adapter and impact material
while locks are held, and only then invokes the selected invoice action.
Standalone invoice actions use the same prefix: read-only scope resolution,
then every applicable Plan 03 property-period/header, broader Ledger, and
accounting-book lock, then the operation key, domain source, and document
series.

### 5. Allocate a unique invoice number at issuance

Use a dedicated organization-scoped invoice document series, not a
configuration catalogue counter. In one checked transaction, issuance:

- validates actor/organization capability, canonicalizes the approved issuance
  payload, resolves every affected property/currency/month scope without
  mutation, and acquires the complete applicable Plan 03
  property-period/header, broader Ledger, and accounting-book lock set in
  deterministic order;
- only after those earlier-order locks, locks the
  organization/invoice/operation idempotency key before any domain-source or
  series lock;
- returns the existing invoice/number/artifact identities when the locked key
  already has the same payload hash, and fails changed-payload reuse;
- for a genuinely new request only, locks and rechecks the invoice approval
  payload and captured lifecycle/book state, then locks the series and
  allocates the next number once;
- stores the exact series/version/format snapshot;
- freezes issued economics and recipient/context snapshots;
- creates the immutable artifact identity and durable issuance request; and
- records actor/time and the payload-bound result against the locked operation
  key before commit.

Captured lifecycle/book status gates only a genuinely new issuance. A completed
same-payload replay still returns its stored identity if the period later
closes; it performs no new source or series mutation.

Numbers are unique and never reused. A retry returns the same number and
invoice. An issuance render failure stays recoverable under the same invoice,
number, and artifact identity; it does not generate a new invoice. An
explicit `issuance_abandoned` record remains audited with its reserved number,
frozen snapshot, actor, and reason, so gaps are explained rather than reused.

### 6. Freeze the issued snapshot

The issued version includes:

- organization/workspace, property, unit, lease, tenant/obligor, billing
  recipient, and contact/address snapshots;
- stable invoice ID and human-readable number;
- issue date, due date, service/billing period, and organization timezone;
- exact currency and line/total amounts;
- the obligation identity plus either the normal occurrence, term, and
  rent-policy identities/versions or the Plan 20 manifest item and typed
  historical-authority absences; billing-policy and series identities/versions;
- for normal new business, the Track A-approved calculation snapshot/hash and
  selected debtor/recipient identities plus the exact accepted Track B
  relationship/date source IDs, versions, resolver version, resolution/reason
  codes, and material evidence hash consumed by that decision;
- review, approval, and issue actors/timestamps;
- immutable artifact ID, object path, byte length, MIME type, SHA-256 checksum,
  and render version; and
- links to cancellation/replacement when present.

Current person/contact, lease, unit, property, or policy edits cannot rewrite
the issued record or bytes.

### 7. Retain official PDF/print bytes safely

Render only from the immutable issued snapshot. Store at a non-overwriting,
organization-scoped object path. Add write-once guards and checked signed-read
authorization.

The generic document replace/archive/delete flow must not be able to alter or
remove an official invoice artifact. Print and download always use the retained
checksum-verified bytes, not a fresh live query.

The tenant-invoice domain owns invoice snapshot/version/number/artifact
immutability and replacement. Generic Documents continues to own versioning
and supersession for signed lease amendments, inspections, and other
operational documents. It may cite the exact invoice artifact through a
checked link, but neither domain becomes the other's versioning authority.

If rendering/finalization fails, the invoice remains in an actionable
`issuing` recovery state. Delivery and close readiness fail closed until the
same artifact identity is finalized or a capability-based
`issuance_abandoned` transition retains the reserved number/snapshot/reason
without claiming issuance. A later replacement starts from a new reviewed
draft and uses a new number.

### 8. Record delivery separately

For the pilot, support:

- retained PDF/print download; and
- a checked manual-delivery record identifying actor, timestamp, approved
  channel label, recipient snapshot, artifact, and outcome.

Every attempt is append-only. `sent` records handoff; `delivered` requires an
actual supported outcome and is not inferred from command success. A failure
retries delivery against the same issued artifact and never allocates a new
number.

No email, Outlook, Telegram, SMTP, webhook, or tenant portal provider is added
until IPS approves channel, consent/contact selection, retry, retention, and
failure policy and the provider capability exists.

### 9. Handle cancellation, replacement, and credit explicitly

- Drafts may be regenerated through checked history.
- An unpaid issued invoice may be cancelled by append-only event with reason
  only after the cancellation command takes the shared
  obligation/invoice/property-period locks and proves either that no allocation
  exists or that every committed positive allocation against the exact invoice
  line has its exact directly linked Plan 05 reversal and the current net
  unreversed signed effect is zero. Any nonzero, unmatched, duplicate, or
  in-flight effect blocks cancellation. Original and reversing rows,
  projections, activity, and invoice links remain immutable.
- Replacement is a new approved invoice, number, version, and artifact linked
  to the cancelled original.
- No issued invoice is edited, regenerated in place, deleted, or renumbered.
- Credit notes are not part of the safe MVP.
- A partially or fully paid invoice cannot be economically cancelled,
  replaced, or corrected in this coordination slice. It enters a blocking exception until
  IPS approves credit/refund/carry-forward treatment.
- Do not reverse a receipt unless cash itself was erroneous, returned, or
  otherwise validly reversed.

### 10. Link Plan 05 settlement without owning it

For new invoice-era receipts, a Plan 05 allocation must retain the exact
invoice header, issued version, and line identities as immutable source scope.
Later obligation-only resolution is forbidden because cancellation/replacement
can leave multiple historical invoice lines. The invoice never creates or
mutates cash.

Allocation publication identity is independent from the obligation's
remaining-balance disposition. One partially paid legacy obligation may contain
both:

- exact pre-cutover allocations classified
  `legacy_cash_non_publishable`, which never attach to the later migration
  invoice or formal-receipt lifecycle; and
- later allocations committed after migration-invoice issuance and classified
  `eligible_invoice_linked`, which alone derive that invoice's settlement state
  and may publish formal receipts.

The obligation's open balance continues to derive from every valid signed
allocation. The migration invoice's settlement state derives only from
allocations frozen to its exact line, preventing prior cash from being counted
twice or retroactively relabelled.

Under the same shared obligation/invoice/property-period locks, settlement
rechecks that the referenced line belongs to the current active `issued`
invoice for the obligation and is not `cancelled`, `superseded`, or
`issuance_abandoned`. Settlement, exact reversal, and cancellation use the same
lock order. Settlement committing first blocks cancellation while its net
unreversed signed effect is nonzero. A fully committed exact reversal may
restore cancellation eligibility after the locked recheck; an in-flight or
partial reversal cannot. Cancellation committing first blocks new settlement
until an approved replacement is issued. Stored allocation and reversal
identities never retarget to that replacement.

Obligation outstanding is derived from the obligation plus every valid signed
allocation/reversal. Invoice settlement display is derived only from
`invoice_bound` effects freezing that exact header/version/line. Delivery
failure, cancellation, or artifact state cannot change either cash
calculation.

Plan 09 and this tenant-invoice coordination slice share one new-business
activation gate. Plan 09 may land in shadow/readiness mode, but a generated
obligation is not exposed as collectable until the invoice slice can issue its
required invoice. After cutover, Plan 05 rejects settlement of a
Plan 09-generated obligation without the exact current-active issued invoice
header/version/line. The obligation-only exception is limited to exact IDs
whose immutable creation provenance and reviewed Plan 20 manifest, frozen into
the named Plan 22 cutover, prove that they predate activation with
`legacy_obligation_only` remaining-balance disposition. A `manual` label,
caller flag, backdated date, or current Lease/Person join cannot create that
status. An open obligation with a Plan 20 `migration_invoice_required`
remaining-balance disposition must have that migration invoice issued before
later settlement and returns `migration_invoice_issuance_required` until then.
A normal Plan 09 obligation without its current active issued invoice returns
`current_issued_invoice_required`. Neither remaining-balance disposition
changes the immutable publication class of cash already committed.

The same atomic activation makes Plan 09 the sole normal creator of rent
obligations. `createRentIncomeItemAction`, `create_finance_income_item`, legacy
wrappers, and direct authenticated DML reject new manual `rent` creation with
`rent_occurrence_generation_required`; the Rent & Income control and a deep
link such as `?action=create&incomeType=rent` route the operator to the Plan 09
generate/catch-up/repair flow instead of silently creating an obligation or
initial cash.
Database enforcement is mandatory even when the UI hides the option. Only an
economic class explicitly designated non-invoiceable by its ratified owner and
policy may keep a manual path. This gate prevents either the
Plan 09-to-invoice deployment interval or a post-cutover compatibility action
from creating invoice-required rent cash without exact invoice authority.

Activation holds the shared creation/cutover policy lock and compares the
complete locked obligation-disposition set plus every existing
receipt/allocation/reversal identity, version, material hash, and allocation
publication class with the reviewed Plan 20 manifest. Drift returns
`legacy_manifest_refresh_required` and blocks activation pending Plan 20
refresh/re-review. A manual create, settlement, or reversal that commits before
activation changes the candidate set and invalidates readiness; activation
committing first makes creation fail with
`rent_occurrence_generation_required` and makes settlement recheck the frozen
remaining-balance disposition.

### 11. Introduce routes without changing bookmark meaning

Add the canonical tenant-invoice surface at `/tenant-invoices` in the later UI
implementation. Keep vendor bills at `/bills-expenses`.

At cutover, replace the current `/invoices` direct redirect with an explicit
compatibility/disambiguation route that explains its former vendor-bill
meaning and links to both destinations. Preserve relevant vendor query
context. Do not silently redirect an old `/invoices` bookmark to tenant
invoices.

This coordination slice defines the migration but does not implement routes or navigation
until the invoice authority and protected reads exist.

### 12. Feed later close and Owner Statement evidence

Expose checked read models for:

- exact issued invoice/version/artifact identity;
- source occurrence/obligation;
- lifecycle, delivery, and derived settlement axes;
- cancellation/replacement chain; and
- artifact availability/checksum.

Ratified Plans 15-16 use missing required invoice artifacts as readiness and
close evidence. Ratified Plans 17-19 may link the artifact as supporting evidence, but invoice records
do not calculate Owner Statement cash or owner liability.

## Invariants

- One occurrence creates at most one obligation; the safe normal
  tenant-invoice path creates one active invoice with one line for that
  obligation. A Plan 20 migration
  line uses exact manifest identity and typed historical occurrence absence.
- Invoice authority is separate from obligation, receipt, Ledger, journal,
  close, and Owner Statement authority.
- Approval, issuance, delivery, and payment are distinct.
- Issue date, due date, service period, received date, and posting date remain
  distinct.
- Issued economics, source links, recipient snapshots, number, and bytes are
  immutable.
- Corrections are append-only and never reuse a number.
- Exact numeric money and currency are preserved without conversion.
- Organization/property/unit/lease/party scope is checked at the database.
- Series allocation and material commands are payload-idempotent.
- Issuance follows Plan 03 locks, then operation-key replay, then domain-source
  and series locks; a same-key race cannot allocate a second number or
  artifact.
- Generic documents and generic Ledger actions cannot alter invoice truth.
- Track B relationship evidence is immutable input to the Track A-approved
  debtor/recipient/calculation snapshot; Track B never owns those decisions.
- Owner-adapter actions and every affected source/destination property-period
  lock are rechecked in the same execution transaction.
- All valid signed receipt allocations/reversals determine obligation
  outstanding. Only `invoice_bound` allocations/reversals freezing the exact
  invoice header/version/line determine that invoice's settlement presentation
  and cancellation eligibility.
- Post-activation settlement stores immutable invoice header/version/line
  identities and accepts new cash only against the current active issued
  invoice under the shared lock; obligation-only retargeting is forbidden.
- Unsupported combined invoices, credit notes, and paid corrections fail
  closed.
- Deposits remain outside ordinary rent invoices in the pilot.
- No tax-invoice or statutory compliance is claimed without approved evidence.

## Acceptance criteria

1. A normal draft is generated from exactly one Plan 09
   occurrence/obligation. A later Plan 20 migration draft instead carries one
   exact obligation, manifest item, and
   `occurrence_not_historically_created`; neither path fabricates identity.
2. No draft can be approved or issued with unresolved recipient, source,
   amount, currency, policy, or capability.
3. Review, approval, issuance, artifact finalization, delivery, and settlement
   are separately evidenced.
4. Issuance acquires the complete applicable Plan 03 lock hierarchy, then locks
   and resolves the operation key before domain-source and series locks,
   allocates one unique non-reusable number for a new payload, and freezes the
   exact economic/recipient/source snapshot in the same transaction.
5. Sequential or concurrent same-key/same-payload issuance returns the same
   invoice/number/artifact identity; changed-payload reuse fails before number
   allocation.
6. Official print/PDF uses retained checksum-verified bytes that generic
   document actions cannot replace or delete.
7. An unrecoverable `issuing` record can transition only to
   `issuance_abandoned`, retaining its reserved number/snapshot/reason and
   making no issued-artifact claim.
8. Multiple partial Plan 05 receipts change obligation outstanding; only
   `invoice_bound` receipts freezing the exact header/version/line change that
   invoice's derived settlement status.
9. Receipt reversal changes obligation outstanding without mutating invoice
   history. Only reversal of an allocation bound to that exact invoice changes
   its derived status; reversal of historical non-publishable cash preserves
   that class and, after migration issuance, returns
   `migration_invoice_replacement_required`.
10. Unpaid cancellation/replacement retains both numbered documents and exact
    links; partial/paid correction and credit cases block. Settlement, exact
    reversal, and cancellation serialize under one lock order. Only nonzero
    unreversed `invoice_bound` cash against that exact line blocks cancellation;
    a complete exact reversal may restore eligibility only after every positive
    allocation against that line is paired and its net effect is zero.
    Historical `legacy_cash_non_publishable` obligation cash neither settles
    nor blocks cancellation of the later migration invoice. Committed
    cancellation blocks new settlement until a replacement is issued.
11. Delivery retries append attempts against the same artifact.
12. Cross-organization, unauthorized, direct-DML, generic-RPC, stale-approval,
    duplicate-source, closed-period, and altered-idempotency attempts fail.
13. A Plan 09-generated obligation cannot accept new-business settlement before
    its exact current-active issued invoice header/version/line exists and is
    frozen on the allocation; cancelled, superseded, abandoned, or
    obligation-only resolution fails. Only exact manifest-backed obligations
    proven to predate cutover retain the obligation-only path and remain
    outside formal-receipt publication. Post-cutover manual rent creation fails
    at the action, checked/legacy RPC, and direct-DML boundaries; labels,
    caller flags, backdated dates, and present-day joins cannot spoof
    grandfather status. The mutually exclusive Plan 20 dispositions and
    `rent_occurrence_generation_required`,
    `current_issued_invoice_required`,
    `migration_invoice_issuance_required`, and
    `legacy_manifest_refresh_required` outcomes remain distinct. On a partially
    paid legacy obligation, prior cash remains independently
    `legacy_cash_non_publishable`; a migration invoice freezes the locked net
    remaining balance, and only later allocations frozen to its exact line are
    `eligible_invoice_linked`.
14. `/invoices` is not silently repurposed and vendor bills remain distinct.
15. Later close/statement reads use the canonical `artifact_available`,
    `artifact_not_historically_created`, `artifact_required_missing`, and
    `artifact_publication_failed` evidence vocabulary.
16. The issued version preserves the exact consumed Track B evidence and
    Track A-approved calculation/debtor/recipient snapshot; a current
    Lease/Person/contact edit cannot re-resolve it.
17. Relationship-driven draft/reset/replacement action is exposed only by the
    tenant-invoice owner adapter and executes under the complete deterministic
    property-period lock set.

## Verification

Required evidence includes:

- RED tests for no current invoice entities, `/invoices` vendor redirect,
  generic document replacement, stale-source approval, and missing artifact
  protection, plus proof that the current action/RPC can create and settle
  manual rent without occurrence/invoice identity;
- pgTAP for schema constraints, one-active-invoice-per-obligation, lifecycle
  transitions, capability/RLS/grants/bypass, source/recipient scope, series
  concurrency, number non-reuse, idempotency, immutability, cancellation and
  replacement, immutable pre-cutover provenance, spoofed legacy/manual
  classification, post-cutover action/RPC/wrapper/direct-DML rent rejection,
  cross-organization and role denial, and preservation of exact
  manifest-backed obligations, including the mutually exclusive Plan 20
  dispositions and distinct normal-invoice, migration-invoice, and manifest
  refresh reason codes. The fixture includes a 1,000 obligation with a 400
  pre-cutover allocation, a locked 600 migration-invoice line, and later
  invoice-linked partial/final allocations without reclassifying or
  double-counting the 400, plus a post-cutover `legacy_obligation_only`
  settlement freezing `settlement_basis = grandfathered_obligation_only` and
  `publication_source_class = legacy_cash_non_publishable`;
- two-session races for draft generation, approval-versus-source change,
  same-key issuance-versus-issuance, changed-payload key reuse,
  issuance-versus-close/composed-correction in both start orders,
  settlement-versus-cancellation, and
  reversal-versus-cancellation, proving partial reversal blocks, complete exact
  reversal can restore eligibility, no path holds the issuance key while
  waiting on an earlier Plan 03 lock, and every outcome retains immutable
  allocation/reversal linkage, plus cutover-versus-manual-rent creation and
  generator-versus-manual-rent creation, activation-versus-legacy-settlement,
  migration-issuance-versus-legacy-reversal, and
  migration-issuance-versus-new-payment in both start orders. Mutation winning
  before activation must invalidate the full obligation/allocation/reversal
  candidate-set hash; activation first must recheck the frozen disposition.
  Reversal before issuance changes the locked line amount; issuance before
  reversal preserves the invoice and returns
  `migration_invoice_replacement_required`. Payment winning before migration
  issuance fails `migration_invoice_issuance_required` without creating an
  allocation; issuance winning first permits exactly one `invoice_bound`
  allocation against its exact header/version/line;
- forced failures between series allocation, issued snapshot, artifact upload,
  finalization, and delivery, proving same-identity recovery;
- Vitest for action validation/error mapping, lifecycle display, independent
  axes, artifact/download authorization, delivery history, query-preserving
  compatibility, route coverage, and post-cutover Rent & Income/deep-link
  denial with actionable generate/catch-up/repair copy while an explicitly
  allowlisted non-invoiceable class remains unaffected;
- authenticated browser verification for generate, review, approve, issue,
  download/print, record manual delivery, partial payment display, cancellation,
  replacement, and every blocker;
- `npm run test:all`, lint, TypeScript, production build, local database reset
  and lint, generated-type comparison, full pgTAP, Plan 03 concurrency
  harnesses, and `git diff --check`.

No external delivery provider, hosted mutation, deployment, or merge is
authorized by this coordination slice.

## Scope exclusions

- No charge occurrence or obligation generation.
- No receipt recording/reversal implementation.
- No formal receipt number, document, or delivery.
- No multi-obligation or combined invoice.
- No deposits on rent invoices.
- No credit note, refund, overpayment, advance-payment, or unapplied-cash
  workflow.
- No automatic email/Outlook/Telegram/SMTP delivery, reminders, or portal.
- No tax/VAT invoice logic.
- No Owner Statement calculation or publication change.
- No historical invoice fabrication or production backfill.
- No hosted Supabase, Vercel deployment, PR merge, or ERP expansion.

## Deliverables

- Append-only invoice/series/artifact/delivery schema and checked commands.
- Stable types and read models for independent lifecycle/delivery/settlement
  axes.
- One-obligation/one-line draft, review, approval, issuance, cancellation, and
  replacement workflows.
- Immutable PDF/print artifact and checked download.
- Manual retained delivery evidence.
- Explicit `/tenant-invoices` and `/invoices` compatibility implementation.
- Source, authorization, immutability, race, failure-recovery, UI, and full
  verification.
- Draft PR; do not merge or deploy.

## Stop conditions

Stop if:

- normal new-business issuance cannot obtain exact Plan 09 occurrence, term,
  rent-policy, obligor, and recipient identities, or a Plan 20 migration line
  lacks its exact obligation, reviewed manifest item, typed historical-authority
  absences, and current recipient snapshot;
- invoice creation generates a second obligation;
- approval, issuance, delivery, or settlement is inferred from another state;
- an issued invoice or artifact can be silently edited, replaced, deleted, or
  renumbered;
- generic documents, Ledger, journals, or PR #38 catalogue values become
  invoice authority;
- number allocation is race-prone or reusable;
- an old `/invoices` bookmark silently changes to tenant meaning;
- implementation requires invented tax/legal, credit, contact, or delivery
  policy; or
- the slice expands to cash settlement, payment processing, portal, ERP,
  hosted mutation, deployment, or merge.

## Required Cross-Plan Amendments

| Target planning package | Target concept/file | Repository evidence | Required decision or wording | Reason | Blocks this track? | Can wait for reconciliation? |
|---|---|---|---|---|---|---|
| Track B — Lease and Occupancy History | Period-effective relationship/date evidence envelope | `lease_parties` distinguishes tenant and billing-contact roles, while accepted party/occupancy/participant/notice evidence and boundary confidence remain Track B-owned | TB-05 returns exact candidates, source IDs/versions, resolution/reason codes, resolver version, and material hash. It does not choose the debtor, recipient, calculation dates, due date, proration, blockers, or snapshot; `billing_contact` is never automatic debtor authority | The unnumbered invoice slice needs reproducible evidence without transferring invoice/calculation authority to Track B | Yes | No before implementation |
| Track A — Plan 09 and unnumbered tenant-invoice coordination slice | Financial selection/snapshot and invoice owner adapter | Plan 09 owns term/policy calculation plus debtor/recipient identity selection; the invoice slice owns lifecycle, issue-time contact approval, and issued evidence | Plan 09 stores the approved calculation/evidence and debtor/recipient identity snapshot. The invoice slice freezes it, approves contact/address/delivery evidence for that recipient, returns exact invoice states/actions/scopes through its adapter, and acquires every deterministic property-period lock before a relationship-driven action | Draft regeneration/reset/replacement must be stale-safe while issued evidence remains immutable | Yes | No |
| Generic Documents / unnumbered tenant-invoice coordination slice | Operational-document versioning versus invoice artifact authority | Generic documents are mutable operational records and cannot own an official invoice artifact | The invoice slice owns invoice versions/artifacts/replacements; Generic Documents owns operational document versions and may only cite exact invoice artifacts through checked links | Prevents either document family from silently replacing the other's evidence | Yes before artifact adoption | No |
| Track A — Plan 09 | Occurrence/obligation output contract | The legacy generator is blocked, current obligations lack term/policy identity, and the generic action/RPC can still create manual rent | Produce one occurrence and obligation with exact calculation/source snapshots and immutable IDs; at the named activation Plan 09 becomes the sole normal rent-obligation creator and the action/RPC/DML boundaries reject manual rent | These are mandatory normal new-business invoice-line sources; Plan 20 alone owns the reviewed legacy-migration exception | Yes | No |
| Track A — Plan 05 | Settlement-to-invoice link | Current allocations target obligations only | Persist exact invoice header/version/line identity for new invoice-era allocations, recheck current-active issued state under shared locks, and forbid later obligation-only resolution without making invoice the cash source | Derived settlement status and receipt evidence need immutable links across cancellation/replacement | Yes for payment display; issuance can land first if receipt entry remains gated | No |
| Configuration registry / PR #38 | Approval and delivery catalogue entries | Registry is open, catalogue-only, and has proposed defaults/roles without runtime authority | Do not activate; future catalogue text must point to versioned billing policy, actual capability, invoice series, and delivery configuration | Prevent a UI catalogue from bypassing financial policy | Yes before configuration-driven behavior | Yes |
