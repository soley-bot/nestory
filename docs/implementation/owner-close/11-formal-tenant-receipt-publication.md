# Formal Tenant Receipt Publication — Unnumbered Coordination Slice

> **Coordination status:** The filename is retained for stable links, but this
> is not ratified Owner Close Plan 11. Ratified Plan 11 remains
> management-fee agreements and deterministic calculation, followed by
> ratified Plan 12 management-fee assessment. This is a prominent unnumbered
> Track A coordination slice.

**Status:** Planned unnumbered coordination slice. Implementation begins only
after Plan 05, the unnumbered tenant-invoice coordination slice, and the named
policy gates are complete.
**Mode:** Standard
**Effort:** High
**Reason:** Cash must remain an atomic source event even when PDF generation or
delivery fails, while the tenant still needs stable numbered, immutable,
traceable evidence of that cash and its allocation.
**Planning/reconciliation baseline:** merged `origin/main` at
`5210ae1c94fa5a854f9c484b79e9dbd214c99053`, containing the merged Track B
planning package.
**Original repository audit baseline:**
`2dea9fb71a539e01ee81b4601f8965fb62a681d5`; retain it for the verified
no-formal-receipt runtime evidence below.

## Context and baseline

Current `finance_receipts` and `finance_receipt_allocations` represent actual
incoming cash and allocation to obligations. They do not have a formal receipt
number, recipient snapshot, immutable artifact, publication lifecycle, or
delivery history. Current UI receipt history is therefore cash evidence, not a
published tenant receipt document.

Plan 05 first makes the receipt/allocation and its Ledger/journal projections
one source transaction. The unnumbered tenant-invoice coordination slice then
gives new tenant billing an issued invoice and line identity. This
formal-receipt coordination slice publishes a document from those committed
sources without creating, modifying, or reversing cash.

Generic document storage and live report PDF generation are reusable
capabilities but not formal receipt authority because generic files can be
replaced/removed and live reports are not retained versions.

This coordination slice consumes the Track A-owned tenant-invoice issued
debtor/recipient/calculation snapshot and the immutable Plan 05 settlement
scope. It does not ask Track B
to select a tenant/recipient again, and it never resolves publication context
from today's Lease, Person, party, occupancy, contact, or
`billing_contact` role.

## Objective

Provide a separate, payload-idempotent publication lifecycle:

```text
committed Plan 05 receipt/allocation
-> publication pending
-> checked receipt number and immutable snapshot
-> retained PDF/print artifact
-> published formal receipt
-> append-only delivery attempts/outcomes
```

For a reversed cash event:

```text
committed reversing receipt/allocation
-> separately numbered reversal/void receipt
-> exact reference to the original receipt event and formal receipt
```

A formal receipt can never exist before money. Rendering or delivery failure
can never roll back, duplicate, or re-date cash.

## Verified current behavior

- `finance_receipts` stores organization/property, received date, amount,
  currency, payer label, reference, reconciliation source, original/reversal
  identity, actor, and timestamps.
- `finance_receipt_allocations` links receipt headers to
  `finance_income_items`; schema cardinality is broader than the current public
  one-header/one-allocation workflow.
- Current reversal preserves the original header and creates a linked reversing
  header/allocations.
- Current receipt/allocation records have no public receipt number, artifact
  ID/path/checksum, recipient context, invoice reference, remaining-balance
  snapshot, payment-method code, publication state, or delivery attempt.
- Current Rent & Income UI displays dated receipt amounts/references but has no
  formal receipt issue, print, PDF, send, or reversal-document action.
- Generic private documents use signed URLs but support file replacement and
  previous-byte removal.
- Report PDF routes render current data on each request rather than retained
  source snapshots.
- Person contacts may carry billing/email/Telegram details, but no general
  billing document delivery provider is implemented.
- The current `/payments` route redirects to incoming Rent & Income even though
  the ratified terminology reserves payment for outgoing bill settlement.

Primary evidence:

- `supabase/migrations/20260710065423_overview_property_cash_events.sql`
- `supabase/migrations/20260723093124_finance_settlement_activity_logging.sql`
- `src/features/rent-income/actions.ts`
- `src/features/rent-income/rent-income-workflow.ts`
- `src/features/rent-income/components/rent-income-screen.tsx`
- `src/features/documents/actions.ts`
- `src/features/documents/data/documents.ts`
- `src/features/reports/data/pdf.ts`
- `src/app/(dashboard)/payments/page.tsx`
- `src/app/legacy-redirects.test.ts`
- `96-tenant-billing-reconciliation.md`

## Prerequisites and decision gates

Implementation requires:

1. Plan 05 committed receipt/allocation IDs, deterministic settlement sequence
   or post-allocation balance snapshot, direct reversal identity, idempotency,
   and atomic projections;
2. the exact tenant-invoice header/version/line identities frozen on the
   committed Plan 05 allocation;
3. approved receipt document-series format/reset policy;
4. approved capability for publication/reissue;
5. accepted manual retained delivery for the pilot;
6. the tenant-invoice issued snapshot retaining its Track A-selected
   debtor/recipient, approved calculation snapshot, and exact consumed Track B
   relationship-evidence IDs/versions/material hash; and
7. IPS confirmation of any payment-method vocabulary or a decision to omit it.

No tax-receipt or statutory compliance claim is made. If required legal/tax
content is identified, stop for a separate approved decision.

## Required changes

### 1. Add a formal receipt authority

Create organization-scoped entities for:

- formal receipt publication and immutable published version;
- append-only publication/reissue/reversal-document events;
- receipt document-series allocation;
- immutable artifact identity and checksum; and
- append-only delivery attempts/outcomes.

Do not add formal-document fields to the cash header in a way that makes the
document the cash authority. The publication has exact foreign identities to
the Plan 05 receipt header and allocation and to the exact tenant-invoice
header/version/line frozen on that allocation.

The safe MVP publishes exactly one formal receipt for one receipt header with
one allocation to one obligation and its exact frozen invoice line.
Multi-allocation publication is deferred even though the underlying allocation
schema can represent it.

### 2. Create publication eligibility from committed cash

A checked read model classifies each non-reversal receipt:

- `eligible_invoice_linked` — committed Plan 05 source, one allocation, and the
  exact issued tenant-invoice header/version/line frozen on that allocation;
- `legacy_cash_non_publishable` — classified pre-invoice, manual, or legacy
  cash for which `invoice_identity_not_historically_available` and
  `artifact_not_historically_created` remain explicit evidence;
- `already_published`;
- `reversed_requires_reversal_document`;
- `blocked_missing_source_or_snapshot`; or
- `unsupported_cardinality`.

Every formal receipt publication requires the invoice-linked case. Legacy cash
cannot enter this publication lifecycle and is never silently turned into a
historical formal receipt. Any future contemporary acknowledgment of a legacy
payment is a separate, currently unapproved document type; it is not a formal
tenant receipt.

Publication work cannot be processed until the cash transaction commits. An
automatic future policy may insert a durable outbox row inside the settlement
transaction, but that row is only a post-commit trigger: it is not the formal
receipt artifact, is invisible to workers if the cash transaction rolls back,
and cannot make uncommitted cash publishable.

Plan 09 and the tenant-invoice coordination slice share the new-business
activation gate defined in the reconciliation. After cutover, Plan 05 rejects
cash against a Plan 09-generated obligation until its exact tenant-invoice
header/version/line is issued and can be frozen on the allocation. A Plan 20
migration invoice supports a later payment only when it is issued before that
payment and the allocation freezes its exact header/version/line; it never
attaches invoice identity or formal-receipt eligibility to cash that was
already settled. Classified pre-invoice/manual/legacy cash remains typed
non-publishable cash evidence.

### 3. Use explicit independent state machines

Publication lifecycle:

| From | Command/evidence | To |
|---|---|---|
| committed eligible receipt | Create idempotent publication request | `pending_publication` |
| committed reversing receipt whose original formal receipt is not yet published | Create reversal publication request with exact dependency | `blocked_dependency` |
| `blocked_dependency` | Original formal receipt or its approved linked replacement for the same committed source and frozen economic snapshot reaches `published` | `pending_publication` |
| `pending_publication` | Validate source/capability, reserve number, freeze snapshot, and create artifact identity | `publishing` |
| `publishing` | Finalize write-once bytes and verified checksum | `published` |
| `publishing` | Record render/upload/finalization failure without changing cash | `failed` |
| `failed` | Retry the same payload, number, and artifact identity | `publishing` |
| `publishing` or `failed` | Capability-based abandonment retaining number, frozen snapshot, actor, and reason without a published claim | `publication_abandoned` |
| `publication_abandoned` | Create an approved linked replacement for the same committed source and frozen economic snapshot with a new operation key, number, and artifact identity | Linked replacement enters `pending_publication`; abandoned row and number remain retained |
| `published` | Begin approved non-economic reissue with linked new publication | Original remains retained and displays `superseded` after the replacement publishes |

Delivery lifecycle is separate:
`not_requested` -> `pending` -> `sent` or `delivered` or `failed`, with each
retry appended against the same published artifact.

Cash-reversal state is also separate and derived only from Plan 05:
`active` -> `reversed`. When the original allocation is formal-receipt eligible
or already has a formal-publication chain, a committed reversing receipt
creates a new `pending_publication` for the separately numbered reversal/void
document when the original or an approved linked replacement for the same
committed source and frozen economic snapshot is already published; otherwise
the reversal document starts in `blocked_dependency`. The original publication
chain is never changed into the reversal document. Reversal of
`legacy_cash_non_publishable` remains Plan 05 cash/reconciliation evidence and
creates neither an original nor a reversal formal receipt.

This formal-receipt slice exposes a versioned read-only owner adapter for exact publication,
version, artifact, and delivery identities; material owner-classified state;
property/currency/period scopes; and only checked publication actions. Track B
impact may transport that opaque result but cannot infer a publication state or
invoke table mutation directly. An approved-but-not-published state permits
only the formal-receipt owner-declared reset/reopen/regenerate action; when unavailable,
the known state remains preserved and the action is reported unavailable.

Any composed correction acquires every affected source and destination
property-period lock in the Plan 03 deterministic order inside the same
transaction, rechecks source/adapter material, and only then invokes the
selected formal-receipt action. Rendering and delivery remain outside the cash source
transaction and never become Track B writes.
Standalone publication, reset, and reissue commands use the same prefix:
read-only scope resolution, then every applicable Plan 03
property-period/header, broader Ledger, and accounting-book lock, then the
operation key, domain source, and receipt-number series.

### 4. Snapshot the exact receipt evidence

The immutable formal receipt version includes:

- stable internal publication ID and human-readable receipt number;
- source receipt-header and allocation IDs;
- original formal receipt/publication IDs for reissue or reversal documents;
- organization/workspace, property, unit, lease, tenant, payer, and billing
  recipient snapshots;
- received date and committed timestamp;
- exact amount and currency;
- reconciliation source and external reference;
- exact tenant-invoice header, number, version, line, and obligation reference
  frozen on the committed allocation;
- exact charge occurrence, authoritative term/version,
  Track A-approved calculation snapshot/hash, selected debtor party/Person,
  recipient snapshot, and all accepted Track B
  party/Person/occupancy/participant/notice source IDs and versions plus
  resolver version, resolution/reason codes, and material relationship hash
  already frozen by the tenant-invoice slice;
- remaining obligation balance immediately after this receipt, from the
  deterministic Plan 05 settlement snapshot/sequence;
- explicit `partial payment` wording when the post-receipt balance is positive;
- approved payment-method code and display snapshot only if IPS supplies a
  controlled vocabulary;
- publishing actor/time, series/version, render version, policy/configuration
  versions; and
- artifact path, byte length, MIME type, SHA-256 checksum, and finalization
  state.

Later receipts, reversals, lease/person edits, invoice delivery changes, or
current balance changes never rewrite that historical snapshot.

This formal-receipt slice copies the exact issued/settlement context; it never re-resolves a
debtor, recipient, Lease/Unit, or occupancy from current rows. A
`billing_contact` remains recipient evidence only and never becomes debtor
authority by role.

### 5. Allocate a separate stable receipt number

Use a dedicated organization-scoped formal-receipt document series. Never
share the invoice series or derive a number from a database UUID/reference.

The checked publication transaction validates authorization/organization scope,
canonicalizes the payload, resolves every affected property/currency/month
scope without mutation, and acquires the complete applicable Plan 03
property-period/header, broader Ledger, and accounting-book lock set in
deterministic order. Only then does it lock the
organization/publication operation-idempotency key before it touches the
domain source or receipt-number series. Under that key lock, the same key and
canonical payload hash returns the previously stored publication
number/artifact result, while the same key with a changed payload fails before
new-request source validation or series allocation.

Only a new request then locks and validates the committed source/allocation,
exact frozen invoice identity, capability, captured lifecycle/book state, and
receipt-number series; allocates one number; freezes the publication payload;
creates the immutable artifact identity/request; and stores the result against
the locked operation key, all in the same transaction.

Captured lifecycle/book status gates only a genuinely new publication. A
completed same-payload replay still returns its stored identity if the period
later closes; it performs no new source or series mutation.

Numbers are unique and never reused. Concurrent same-key/same-payload requests
serialize to the same stored publication, number, and artifact identity. A
render retry uses that same identity. An explicit `publication_abandoned`
record retains its reserved number, frozen snapshot, actor, and reason without
claiming a published artifact. An approved linked replacement uses a new
operation key, number, and artifact identity while copying the same committed
source and frozen economic snapshot; the abandoned row and number remain
retained and explain the gap.

### 6. Render and retain official bytes

Render PDF/print from the immutable publication snapshot, not a live Rent &
Income query. Write once to an organization-scoped object path and finalize the
stored checksum/length with a checked idempotent command.

Generic document replace/archive/delete actions cannot alter or remove formal
receipt artifacts. Signed reads validate organization/capability and artifact
state. Print/download always returns the retained bytes.

The formal-receipt domain owns its publication versions, numbers,
artifacts, reversal documents, and non-economic reissues. Generic Documents
retains versioning/supersession authority for operational documents and may
only cite an exact formal-receipt artifact through a checked link. Neither
domain may replace the other's bytes or lifecycle.

If rendering/finalization fails, cash remains committed and visible while the
publication remains in an actionable `publishing` or `failed` state. Retry
cannot create a second receipt event, publication, or number.
Capability-based abandonment uses the explicit terminal state above and leaves
`artifact_required_missing` evidence when publication remains required. An
approved recovery creates the linked replacement described above from the same
committed source and frozen economic snapshot; it never edits the abandoned
publication or reuses its number.

### 7. Keep delivery independent

For the pilot, support retained PDF/print download plus a checked manual
delivery record. Each attempt stores:

- publication/artifact and immutable recipient snapshot;
- channel label from approved configuration;
- actor, request time, outcome time, and provider/manual reference;
- `pending`, `sent`, `delivered`, or `failed` outcome; and
- retry relation/error classification.

`sent` is not `delivered`. Delivery failure does not change cash, invoice
settlement state, publication number, or bytes. Retry appends an attempt against
the same artifact.

No email, Outlook, Telegram, SMTP, webhook, or portal delivery is implemented
until the provider, consent/contact selection, retries, retention, and failure
policy are approved.

### 8. Publish reversal/void evidence without overwriting

When Plan 05 creates a reversing receipt whose original allocation is
formal-receipt eligible or already has a formal-publication chain:

- never delay or reject the actual cash reversal because original receipt
  rendering/publication is pending, failed, or absent;
- preserve the original cash event and formal receipt;
- mark reversal status only as a derived relation;
- require a separately numbered reversal/void receipt sourced from the
  reversing header/allocation;
- reference the original receipt event, formal receipt number/version, invoice
  line, reason, reversal date, and exact reversing amount;
- retain immutable bytes and separate delivery history; and
- block close readiness if policy requires the reversal document and it is
  missing.

A formal receipt is never voided merely because delivery failed. Cash reversal
must be real and committed before a reversal/void receipt can publish.

If cash reverses before the original formal receipt is published, the checked
workflow ensures an idempotent original publication request exists and places
the reversal document in `blocked_dependency`. It finalizes/retains the
original receipt snapshot first, then publishes the separately numbered
reversal document. If the original reaches `publication_abandoned`, an approved
linked replacement must copy the same committed source and frozen economic
snapshot while receiving a new number/artifact; the abandoned row and number
remain retained. Publication of either the original or that approved linked
replacement satisfies the reversal document's `blocked_dependency`. A failed
or abandoned chain remains `artifact_required_missing` or
`artifact_publication_failed` with an original-receipt reason; the dependent
reversal document carries its own reason, and close remains blocked until the
required original-or-replacement artifact and reversal artifact are available.
Cash remains reversed throughout.

Reversal of `legacy_cash_non_publishable` cash does not enter this section's
publication state machine. It remains exact Plan 05 reversal and reconciliation
evidence without either an original or reversal formal receipt.

After an exact full cash reversal restores an invoice's cancellation
eligibility, later invoice cancellation or replacement never waits for receipt
publication and never deletes, retargets, or rewrites the original or
reversal/void publication chains. Those artifacts remain bound to the
allocation-frozen original invoice identity, and any missing required artifacts
continue to block close independently.

### 9. Correct document errors append-only

If the cash source is correct but an issued artifact contains a non-economic
render/recipient presentation defect:

- retain the original artifact and publication;
- append a supersession/reissue event with reason;
- publish a new receipt version/number according to the approved series policy;
  and
- link both directions and delivery histories.

If payer, amount, date, currency, allocation, or other source economics are
wrong, correct Plan 05 through actual reversal/new receipt first. Do not use
document reissue to hide a cash correction.

Credit, refund, overpayment, and advance-payment documents remain outside this
slice.

### 10. Add explicit tenant-receipt navigation later

Use `/tenant-receipts` or a clearly labeled Tenant Billing receipt view for
incoming formal receipts. Do not call them outgoing payments.

The existing `/payments` incoming-cash bookmark must not silently change to
vendor payment meaning. At a later cutover, use an explicit
compatibility/disambiguation page before any retirement or semantic change,
preserving relevant query context.

This planning task does not implement routes or navigation.

### 11. Feed close and Owner Statement evidence

Expose checked evidence for:

- source receipt/allocation and reversal relation;
- invoice/obligation link;
- publication/version/number/artifact/checksum;
- partial-payment and post-payment-balance snapshot;
- delivery attempts/outcomes; and
- canonical `artifact_available`, `artifact_not_historically_created`,
  `artifact_required_missing`, or `artifact_publication_failed` state, with a
  document-kind/reason code for an original or reversal/void receipt.

Ratified Plans 15-16 decide whether missing evidence blocks reconciliation or
close. Ratified Plans 17-19 link formal receipt artifacts as supporting
evidence but continue to calculate cash from Plan 05 allocations. Owner
Statement delivery remains separate.

## Invariants

- A formal receipt can only reference committed money.
- Receipt event/allocation remains cash authority.
- Formal receipt publication never creates, changes, allocates, re-dates, or
  reverses cash.
- Safe MVP is one receipt, one allocation, one obligation, and exactly one
  issued tenant-invoice header/version/line frozen on that allocation.
- Classified pre-invoice, manual, and legacy cash is typed non-publishable cash
  evidence and cannot enter the formal-receipt lifecycle.
- Multiple partial receipts create separate cash events and separate formal
  receipt publications.
- Received, publication, issue, posting, and delivery dates remain distinct.
- Exact money/currency and source identities are immutable.
- Remaining-balance wording is a historical post-receipt snapshot, not a live
  balance.
- Published number, snapshot, checksum, and bytes are never reused,
  overwritten, or deleted.
- An abandoned publication and number remain retained; its approved linked
  replacement uses a new number/artifact and the same committed source and
  frozen economic snapshot.
- For formal-receipt-eligible cash, reversal preserves the original and creates
  separate source and document evidence. Legacy non-publishable cash creates
  only exact Plan 05 reversal/reconciliation evidence.
- Generic documents, Ledger, journals, and Owner Statements are not receipt
  authority.
- Delivery attempts are append-only and separate by document family.
- Unsupported cardinality, unapplied cash, overpayment, advance payment,
  unknown method, or fabricated legacy history fails closed.
- Publication context is copied from immutable Track A invoice/settlement
  evidence; Track B or current master/compatibility rows are never re-resolved
  at publication time.
- Owner-adapter state/action and every affected property-period scope are
  rechecked under the same execution transaction before any lifecycle
  mutation.

## Acceptance criteria

1. No publication can begin before a committed Plan 05 receipt/allocation.
2. Every formal publication requires the exact issued tenant-invoice
   header/version/line frozen on that allocation. Legacy cash remains
   `legacy_cash_non_publishable`; any future contemporary acknowledgment is a
   separate, unapproved document type.
3. The immutable snapshot includes every required payer/tenant/context/source,
   amount/date/currency, partial-payment, and remaining-balance field.
4. The complete applicable Plan 03 lock hierarchy precedes the
   operation/idempotency-key lock and replay check, which precede domain-source
   and receipt-series locks in the same transaction. Concurrent
   same-key/same-payload requests return one stored identity; a changed payload
   fails before number allocation.
5. PDF/print returns retained checksum-verified bytes that generic document
   actions cannot replace or delete.
6. Rendering or delivery failure leaves cash intact and supports
   same-identity retry.
7. `publication_abandoned` retains the reserved number/snapshot/reason and
   makes no published-artifact claim. Approved recovery creates a linked
   replacement for the same committed source/frozen economic snapshot with a
   new number/artifact while retaining the abandoned row and number.
8. Multiple partial payments publish separate receipts with historically
   correct balance-after snapshots.
9. Cash reversal commits regardless of publication state. For an original
   allocation that is formal-receipt eligible or already has a publication
   chain, an unpublished original leaves the reversal document in
   `blocked_dependency` until the original or its approved linked replacement
   for the same source/snapshot publishes; that artifact and the reversal
   artifact remain explicit close evidence. Reversal of
   `legacy_cash_non_publishable` creates neither document. A later invoice
   cancellation/replacement after complete exact reversal neither waits for nor
   alters either formal-publication chain.
10. Non-economic document correction is append-only; economic correction must
   follow Plan 05.
11. Every publication, delivery, and cash-reversal state transition follows
    the independent state machines above; retry never creates new cash or a new
    number.
12. Cross-organization, unauthorized, direct-DML, generic-RPC, stale-source,
    duplicate-number, unsupported-cardinality, and altered-idempotency attempts
    fail.
13. Close/statement reads can distinguish artifact availability and never use
    the document as monetary authority.
14. Incoming receipts and outgoing payments remain terminologically and
    route-distinct.
15. Invoice-era publications retain exact occurrence/term/calculation,
    debtor/recipient, and consumed relationship-evidence IDs/versions/hash
    without re-resolving current Lease/Person data.
16. Relationship-driven publication reset/reissue is available only through
    the formal-receipt owner adapter and the complete deterministic property-period
    lock set.
17. A Plan 20 migration invoice supports a later payment only when the invoice
    is issued first and the allocation freezes its exact identity; it never
    retroactively makes settled legacy cash publishable.

## Verification

Required evidence includes:

- RED tests proving current receipt rows have no number/artifact/delivery
  identity and generic document bytes are replaceable;
- pgTAP for source eligibility, one publication chain per source/version with
  only approved linked abandonment replacements, capability,
  RLS/grants/bypass, series concurrency, number non-reuse, idempotency,
  immutable snapshots, source/reversal relations, unsupported cardinality, and
  artifact metadata;
- two-session races for same-key publication-versus-publication,
  publication-versus-reversal, publication-versus-close/composed-correction in
  both start orders, abandonment replacement, and reissue, proving Plan 03
  locks precede the operation key, no `40P01` occurs, one number is allocated
  per operation key, and a published original or approved linked replacement
  releases the reversal dependency;
- forced failures between source validation, number allocation, artifact
  upload, finalization, and delivery, proving no cash mutation and
  same-identity recovery;
- Vitest for field/copy validation, partial wording, historical balance,
  download/print authorization, reversal receipt, delivery attempts, route
  terminology, compatibility, and close evidence;
- authenticated browser verification for publish, download/print, manual
  delivery, failed delivery/retry, first/second partial receipts, reversal
  document, reissue, and blocker states;
- byte/checksum stability and signed-read authorization tests;
- `npm run test:all`, lint, TypeScript, production build, local database reset
  and lint, generated-type comparison, full pgTAP, Plan 03 concurrency
  harnesses, and `git diff --check`.

No delivery provider, hosted mutation, deployment, or merge is authorized.

## Scope exclusions

- No cash receipt/allocation or reversal implementation.
- No invoice generation, approval, issuance, or delivery implementation.
- No multi-allocation or cross-invoice receipt.
- No unapplied cash, overpayment, advance payment, refund, credit note, deposit,
  or payment-processing workflow.
- No tax/statutory receipt logic.
- No automatic email/Outlook/Telegram/SMTP delivery, reminder, or portal.
- No Owner Statement calculation, artifact, or delivery implementation.
- No fabricated historical formal receipts or production backfill.
- No hosted Supabase, Vercel deployment, PR merge, general ledger, or ERP.

## Deliverables

- Append-only formal-receipt/series/artifact/delivery schema and checked
  commands.
- Eligibility/read models bound to exact Plan 05 and tenant-invoice identities.
- Immutable receipt and reversal/void receipt PDF/print artifacts.
- Manual retained delivery evidence and same-artifact retries.
- Append-only reissue behavior for non-economic document defects.
- Explicit Tenant Receipt route/terminology compatibility implementation.
- Source, authorization, immutability, race, failure-recovery, UI, and full
  verification.
- Draft PR; do not merge or deploy.

## Stop conditions

Stop if:

- any formal receipt can precede actual committed cash;
- document publication creates or mutates a receipt/allocation;
- Plan 05 cannot provide deterministic balance-after and reversal identity;
- any formal receipt lacks exact allocation-frozen tenant-invoice
  header/version/line identity;
- a historical row is made to look like a historical issued receipt;
- number allocation is race-prone/reusable;
- bytes or snapshots can be silently overwritten/deleted;
- reversal hides the original or publishes without reversing cash;
- receipt reversal is blocked on artifact/render/delivery state;
- delivery failure changes cash or creates another number;
- payment method, tax, channel, recipient, or retention policy must be invented;
  or
- the slice expands into settlement, payment processing, portal, ERP, hosted
  mutation, deployment, or merge.

## Required Cross-Plan Amendments

| Target planning package | Target concept/file | Repository evidence | Required decision or wording | Reason | Blocks this track? | Can wait for reconciliation? |
|---|---|---|---|---|---|---|
| Track A — Plan 05 | Deterministic settlement order and balance-after snapshot | Current receipt rows expose amounts/dates but do not preserve a formal historical remaining-balance value | Persist or return under lock an immutable settlement sequence and post-allocation outstanding snapshot for publication | A later receipt must not rewrite what an earlier formal receipt says remained after payment | Yes | No |
| Track A — Plan 05 | Direct allocation reversal identity | Current reversal links headers but clones allocations without exact allocation-to-allocation relation | Add exact original/reversing allocation identity and signed canonical effect | Reversal/void receipt must cite the exact reversed allocation | Yes | No |
| Track A — unnumbered tenant-invoice coordination slice | Invoice/version/line identity | Current obligations/receipts have no invoice source | Require every formal-receipt-eligible allocation to retain the exact issued tenant-invoice header/version/line; legacy obligation-only cash remains non-publishable | Formal receipts must identify exactly what invoice line was paid without retroactive resolution | Yes | No |
| Track B — Lease and Occupancy History | Exact relationship/date evidence retained through the tenant-invoice snapshot | Current party/contact data can change after cash is received, but Track B owns evidence candidates rather than a financial recipient/debtor selection | TB-05 supplies accepted source IDs/versions/reasons/hash to Plan 09 and the invoice slice. The formal-receipt slice copies the issued invoice and Plan 05 settlement snapshots and never re-resolves current rows; `billing_contact` is not debtor authority | Published receipt history cannot change with today's tenant/contact or transfer selection authority to Track B | Yes through tenant-invoice issuance | No before new-business publication |
| Track A — unnumbered formal-receipt coordination slice | Publication owner adapter and composed locks | A relationship correction can affect draft/approved publication evidence but must not rewrite committed cash or published artifacts | Return exact publication states/actions/scopes through the formal-receipt adapter and acquire all deterministic property-period locks before reset/reissue action; preserve issued/published originals | Makes cross-track impact actionable without Track B owning document or cash lifecycle | Yes before affected execution | No |
| Generic Documents / unnumbered formal-receipt coordination slice | Operational-document versioning versus formal-receipt artifact authority | Generic document replacement cannot provide immutable numbered receipt publication | The formal-receipt domain owns versions/artifacts/reissues; Generic Documents owns operational versions and may only cite exact receipt artifacts through checked links | Prevents silent cross-domain byte replacement | Yes before artifact adoption | No |
| Configuration registry / PR #38 | Receipt numbering and delivery | PR #38 has no receipt-series authority and is catalogue-only | Add no active default; future catalogue entries point to the receipt series and tenant-receipt delivery configuration | A generic setting cannot allocate numbers or prove delivery | Yes before configuration-driven behavior | Yes |
