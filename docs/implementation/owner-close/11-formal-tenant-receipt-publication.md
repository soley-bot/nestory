# Plan 11 — Formal Tenant Receipt Publication

**Status:** Planned current-sequence slice. Implementation begins only after
Plans 05 and 10 and the named policy gates are complete.
**Mode:** Standard
**Effort:** High
**Reason:** Cash must remain an atomic source event even when PDF generation or
delivery fails, while the tenant still needs stable numbered, immutable,
traceable evidence of that cash and its allocation.
**Planning baseline:** merged `origin/main` at
`2dea9fb71a539e01ee81b4601f8965fb62a681d5`.

## Context and baseline

Current `finance_receipts` and `finance_receipt_allocations` represent actual
incoming cash and allocation to obligations. They do not have a formal receipt
number, recipient snapshot, immutable artifact, publication lifecycle, or
delivery history. Current UI receipt history is therefore cash evidence, not a
published tenant receipt document.

Plan 05 first makes the receipt/allocation and its Ledger/journal projections
one source transaction. Plan 10 then gives new tenant billing an issued invoice
and line identity. This Plan 11 publishes a document from those committed
sources without creating, modifying, or reversing cash.

Generic document storage and live report PDF generation are reusable
capabilities but not formal receipt authority because generic files can be
replaced/removed and live reports are not retained versions.

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
2. Plan 10 invoice/line identity for normal new-business receipts;
3. approved receipt document-series format/reset policy;
4. approved capability for publication/reissue;
5. accepted manual retained delivery for the pilot;
6. Track B period-effective tenant/recipient context available through the
   Plan 10 snapshot; and
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
the Plan 05 receipt header and allocation, and for normal invoice-era cash, the
Plan 10 invoice/version/line.

The safe MVP publishes exactly one formal receipt for one receipt header with
one allocation to one obligation/invoice line. Multi-allocation publication is
deferred even though the underlying allocation schema can represent it.

### 2. Create publication eligibility from committed cash

A checked read model classifies each non-reversal receipt:

- `eligible_invoice_linked` — committed Plan 05 source, one allocation, exact
  issued Plan 10 invoice line;
- `eligible_legacy_obligation` — only when a reviewed migration manifest
  explicitly authorizes a current publication type;
- `already_published`;
- `reversed_requires_reversal_document`;
- `blocked_missing_source_or_snapshot`; or
- `unsupported_cardinality`.

Normal post-cutover publication requires the invoice-linked case. A historical
cash row is never silently turned into a historical formal receipt.

The publication request is created only after the cash transaction commits. An
automatic future policy may enqueue a durable request in the settlement
transaction, but the request is not the artifact and cannot make uncommitted
cash publishable.

Plan 09 and Plan 10 share the new-business activation gate defined in the
reconciliation. After cutover, Plan 05 rejects cash against a Plan 09-generated
obligation until its exact Plan 10 invoice line is issued. Plan 11 therefore
never receives a newly generated source that is both normally settled and
uninvoiceable. Classified pre-invoice/manual/legacy cash remains a separate
eligibility class and is never disguised as new invoice-era publication.

### 3. Use explicit independent state machines

Publication lifecycle:

| From | Command/evidence | To |
|---|---|---|
| committed eligible receipt | Create idempotent publication request | `pending_publication` |
| committed reversing receipt whose original formal receipt is not yet published | Create reversal publication request with exact dependency | `blocked_dependency` |
| `blocked_dependency` | Original formal receipt reaches `published` | `pending_publication` |
| `pending_publication` | Validate source/capability, reserve number, freeze snapshot, and create artifact identity | `publishing` |
| `publishing` | Finalize write-once bytes and verified checksum | `published` |
| `publishing` | Record render/upload/finalization failure without changing cash | `failed` |
| `failed` | Retry the same payload, number, and artifact identity | `publishing` |
| `publishing` or `failed` | Capability-based abandonment retaining number, frozen snapshot, actor, and reason without a published claim | `publication_abandoned` |
| `published` | Begin approved non-economic reissue with linked new publication | Original remains retained and displays `superseded` after the replacement publishes |

Delivery lifecycle is separate:
`not_requested` -> `pending` -> `sent` or `delivered` or `failed`, with each
retry appended against the same published artifact.

Cash-reversal state is also separate and derived only from Plan 05:
`active` -> `reversed`. A committed reversing receipt creates a new
`pending_publication` for the separately numbered reversal/void document when
the original is already published; otherwise the reversal document starts in
`blocked_dependency`. The original publication is never changed into the
reversal document.

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
- exact invoice number/version/line and obligation reference, or explicit
  reviewed legacy classification;
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

### 5. Allocate a separate stable receipt number

Use a dedicated organization-scoped formal-receipt document series. Never
share the invoice series or derive a number from a database UUID/reference.

The checked publication transaction locks the series, validates the committed
source/snapshot and capability, allocates one number, freezes the publication
payload, creates an immutable artifact identity/request, and stores a
payload-bound idempotency result.

Numbers are unique and never reused. Same key and payload returns the existing
publication. A render retry uses the same publication, number, and artifact
identity. An explicit `publication_abandoned` record retains its reserved
number, frozen snapshot, actor, and reason without claiming a published
artifact; a later replacement uses a new number and the audited record explains
the gap.

### 6. Render and retain official bytes

Render PDF/print from the immutable publication snapshot, not a live Rent &
Income query. Write once to an organization-scoped object path and finalize the
stored checksum/length with a checked idempotent command.

Generic document replace/archive/delete actions cannot alter or remove formal
receipt artifacts. Signed reads validate organization/capability and artifact
state. Print/download always returns the retained bytes.

If rendering/finalization fails, cash remains committed and visible while the
publication remains in an actionable `publishing` or `failed` state. Retry
cannot create a second receipt event, publication, or number.
Capability-based abandonment uses the explicit terminal state above and leaves
`artifact_required_missing` evidence when publication remains required.

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

When Plan 05 creates a reversing receipt:

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
reversal document. A failed or abandoned required original classifies as
`artifact_required_missing` or `artifact_publication_failed` with an
original-receipt reason; the dependent reversal document carries its own reason
and close remains blocked until both required artifacts are available. Cash
remains reversed throughout.

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

Plans 17-18 decide whether missing evidence blocks close. Plans 19-21 link
formal receipt artifacts as supporting evidence but continue to calculate
cash from Plan 05 allocations. Owner Statement delivery remains separate.

## Invariants

- A formal receipt can only reference committed money.
- Receipt event/allocation remains cash authority.
- Formal receipt publication never creates, changes, allocates, re-dates, or
  reverses cash.
- Safe MVP is one receipt, one allocation, one obligation, and one invoice
  line where an invoice exists.
- Multiple partial receipts create separate cash events and separate formal
  receipt publications.
- Received, publication, issue, posting, and delivery dates remain distinct.
- Exact money/currency and source identities are immutable.
- Remaining-balance wording is a historical post-receipt snapshot, not a live
  balance.
- Published number, snapshot, checksum, and bytes are never reused,
  overwritten, or deleted.
- Reversal preserves the original and creates separate source and document
  evidence.
- Generic documents, Ledger, journals, and Owner Statements are not receipt
  authority.
- Delivery attempts are append-only and separate by document family.
- Unsupported cardinality, unapplied cash, overpayment, advance payment,
  unknown method, or fabricated legacy history fails closed.

## Acceptance criteria

1. No publication can begin before a committed Plan 05 receipt/allocation.
2. Normal new-business publication requires one exact issued invoice line.
3. The immutable snapshot includes every required payer/tenant/context/source,
   amount/date/currency, partial-payment, and remaining-balance field.
4. One transactional, non-reusable receipt number is allocated per
   publication and retries return the same identity.
5. PDF/print returns retained checksum-verified bytes that generic document
   actions cannot replace or delete.
6. Rendering or delivery failure leaves cash intact and supports
   same-identity retry.
7. `publication_abandoned` retains the reserved number/snapshot/reason, makes
   no published-artifact claim, and leaves canonical missing-artifact evidence
   when the document is required.
8. Multiple partial payments publish separate receipts with historically
   correct balance-after snapshots.
9. Cash reversal commits regardless of publication state; if the original
   formal receipt is not published, the reversal document waits on the
   original publication and both required artifacts remain explicit close
   evidence.
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

## Verification

Required evidence includes:

- RED tests proving current receipt rows have no number/artifact/delivery
  identity and generic document bytes are replaceable;
- pgTAP for source eligibility, one-publication-per-source/version, capability,
  RLS/grants/bypass, series concurrency, number non-reuse, idempotency,
  immutable snapshots, source/reversal relations, unsupported cardinality, and
  artifact metadata;
- two-session races for publication-versus-publication,
  publication-versus-reversal, publication-versus-close, and reissue;
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
- Eligibility/read models bound to exact Plan 05 and Plan 10 identities.
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
- a new-business receipt lacks exact invoice-line identity;
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
| Track A — Plan 10 | Invoice/version/line identity | Current obligations/receipts have no invoice source | Require new invoice-era allocations to retain or deterministically resolve one exact issued invoice line | Normal formal receipts must identify what invoice was paid | Yes for new business | No |
| Track B — Lease and Occupancy History | Period-effective tenant/recipient snapshots | Current party/contact data can change after cash is received | Supply the stable identities Plan 10 snapshots; Plan 11 copies the issued/settlement context and never resolves from current rows | Published receipt history cannot change with today's tenant/contact | Yes through Plan 10 | Yes, until joint reconciliation |
| Configuration registry / PR #38 | Receipt numbering and delivery | PR #38 has no receipt-series authority and is catalogue-only | Add no active default; future catalogue entries point to the receipt series and tenant-receipt delivery configuration | A generic setting cannot allocate numbers or prove delivery | Yes before configuration-driven behavior | Yes |
