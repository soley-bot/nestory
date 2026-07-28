# Plan 11 — Immutable Owner Statement Publication

> **Legacy broad design source — not current Plan 11.** The ratified sequence
> split this analysis into **sequence 17, statement data**, **sequence 18,
> immutable artifacts**, and **sequence 19, delivery/history**. Use
> `97-ratified-final-sequence.md`; do not paste this file directly into Codex.

**Mode:** Standard  
**Effort:** High  
**Reason:** A live report and freshly generated PDF cannot serve as the historical financial record sent to an owner.

## Context and baseline

Planning baseline is `main` at `823deb4735b8124edefd1e68e451c21f1962b075`. Begin only after Plan 10 establishes a closed property period with a frozen owner roster, reconciliation status, and canonical source manifest.

Current Owner Statement behavior is a live report calculation. The selected recipient report reduces one owner/property/month to aggregate facts, removes internal evidence and source links, and the PDF endpoint renders a fresh document on each request. There is no statement identity, version, immutable line set, approval, publication, delivery, reissue, supersession, or retained rendered artifact.

## Objective

Create a first-class, immutable, itemized Owner Statement generated only from a closed property period. Preserve internal source evidence, store the exact owner-facing artifact, support controlled approval and reissue, and make historical statements reproducible even when operational records or contact details later change.

## Verified current behavior

- Owner allocation logic already handles effective dated ownership shares and can block ambiguous rosters.
- Current reports have reusable money formatting, CSV safety, PDF infrastructure, and authenticated export endpoints.
- Current recipient output contains aggregate operating cash, expenses, management fees, owner contributions, owner payouts, deposits held, and net owner cash movement.
- Current report rows can carry evidence and source links internally, but recipient mode removes them.
- Private Supabase Storage is already used for business documents.
- Report generation currently stamps the current time and queries active operational records rather than a historical snapshot.

## Required changes

### 1. Add persistent statement entities

Create organization-scoped tables with append-only migrations.

#### `owner_statements`

One logical statement per organization, property, owner, period, and currency:

- `id`, `organization_id`, `property_id`, `owner_person_id`, `period_start`, `currency`;
- linked `property_reporting_period_id`;
- stable statement number;
- lifecycle status such as draft, approved, published, superseded, or cancelled;
- current published version ID where useful as a convenience pointer;
- created/audit metadata;
- unique logical statement scope.

#### `owner_statement_versions`

One immutable calculation/publication version:

- statement ID and monotonically increasing version number;
- calculation version;
- close/source manifest hash;
- owner roster/share snapshot;
- property identity/address snapshot needed for the document;
- owner recipient name/contact/payment-instruction snapshot needed for the document;
- opening balance, period section totals, reserve, available amount, and closing balance;
- deposit opening/movement/closing disclosure totals;
- approval, publication, supersession, and cancellation metadata;
- superseded version ID and reissue reason;
- rendered PDF/CSV storage path, MIME type, byte size, and checksum;
- generated, approved, and published timestamps/actors;
- immutable after approval except for the narrowly defined lifecycle columns.

#### `owner_statement_lines`

Itemized immutable lines:

- version ID and deterministic line number;
- section and category code;
- event date, description, property/unit/lease context snapshots;
- optional tenant, vendor, task, or reference display snapshots;
- exact debit, credit, or signed owner-balance effect using one documented convention;
- currency;
- source count/evidence indicator;
- display order and subtotal relationship where needed.

#### `owner_statement_sources`

Internal immutable source manifest:

- statement version and line IDs;
- canonical `event_key`, source type, source ID, original/reversal identity;
- source amount/effect and source hash;
- exact internal record-link metadata;
- no mutable operational label as the sole identity.

#### `owner_statement_deliveries`

Delivery attempts and outcomes:

- version, recipient channel/address snapshot, delivery status;
- attempted/sent/failed timestamps;
- actor/provider/message reference when available;
- error class safe for operator display;
- manual-delivery acknowledgement where email delivery is not used.

Do not store one mutable PDF path on the logical statement and overwrite it on reissue.

### 2. Define the owner-facing statement structure

The initial IPS statement should be itemized and operationally understandable. Minimum sections:

1. Statement identity: owner, property, period, statement number, version, generated/published date.
2. Opening owner balance.
3. Income received during the period, categorized at least by rent and supported IPS income types, with unit/tenant/reference context.
4. Property expenses paid during the period, with category, vendor/task/reference context.
5. Management fees, showing basis, rule, calculated amount, tax only if required, waiver or adjustment where applicable.
6. Owner contributions.
7. Owner distributions.
8. Reserve holds/releases and resulting reserve balance when supported.
9. Approved adjustments.
10. Closing owner balance and available-to-distribute amount.
11. Security-deposit custody disclosure: opening held, received, applied/retained/refunded, and closing held; excluded from operating net unless an approved disposition creates an owner effect.
12. Outstanding tenant balance/arrears and approved unpaid-bill disclosures when IPS wants them, clearly separated from cash movement.
13. Notes, approved exceptions, and contact/payment instructions as snapshots.

The statement must not use abstract debit/credit accounting language as its primary owner-facing explanation.

### 3. Generate only from the closed snapshot

Create a checked generation RPC/service that:

- requires a closed property reporting period;
- uses its frozen owner roster and canonical source manifest;
- calculates owner allocation by effective source date using the approved snapshot;
- uses owner-balance results from Plan 09;
- creates deterministic lines and totals;
- verifies that line totals equal version totals and the closed-period owner-balance equation;
- verifies source hashes and rejects a stale or altered close;
- creates one draft version idempotently for the same close/source hash;
- never re-queries current archived/contact/ownership state as the historical authority.

A later operational archive, ownership edit, contact change, or source reversal must not change an existing statement version.

### 4. Add approval and publication lifecycle

#### Draft

- Generated from one closed period.
- Reviewable internally with exact source links and close exceptions.
- May be discarded and regenerated only while no approved/published version exists and the source hash remains valid.

#### Approved

- Admin approval revalidates totals/source hash and freezes all calculation and line fields.
- Approval cannot succeed with unresolved Critical close exception or missing owner recipient requirements.
- Approved data cannot be edited through generic table writes or application actions.

#### Published

- Render PDF and CSV from immutable statement-version rows, not live operational queries.
- Store artifacts in private Storage under an organization/statement/version path.
- Persist checksum, size, and path.
- Publishing is idempotent; retry returns the same artifact when content is unchanged.
- Authenticated download serves the retained artifact and verifies organization access.

#### Reissue

- Reopen and re-close the property period when source facts must change.
- Create a new version with mandatory reason.
- Preserve and mark the prior published version superseded; never overwrite or delete it.
- A reissued statement receives visible version/reissue labeling.

#### Cancellation

Only for a statement that should not have been delivered. Preserve the artifact and audit trail, mark it cancelled, and require reason. Cancellation does not rewrite financial history.

### 5. Preserve internal evidence without exposing private implementation details

Internal review must retain exact source links to obligations, receipts, payments, tasks, petty cash, deposits, fees, owner events, documents, and close exceptions.

Owner-facing artifacts should be itemized enough to validate the statement but should not expose:

- raw UUIDs;
- internal-only journal/account IDs;
- private signed Storage URLs;
- unrelated tenant/vendor personal data;
- internal exception/debug text.

The rendered line snapshots provide the owner-readable description; `owner_statement_sources` provides the internal audit trail.

### 6. Retain statement artifacts and supporting evidence

- Use private Storage and checked download endpoints.
- Never remove the prior binary when a new version is published.
- Store an artifact checksum and verify it on retrieval or release validation.
- Link supporting invoice/receipt documents through source records or a statement evidence package without copying/deleting the originals.
- Define retention behavior before production; default is no hard deletion of published financial artifacts.

### 7. Replace live Owner Statement routes safely

After this plan:

- `/reports/owner-statement` becomes a close/publication index or compatibility redirect to the Owner Close/statement workspace.
- A closed property-period exposes Generate draft, Review, Approve, Publish, Download, Deliver, and Reissue actions according to status.
- A property/owner record exposes statement history by period/version.
- The existing live calculation remains available only as a temporary shadow comparison during cutover, never as the official downloadable owner artifact.
- API PDF/CSV routes resolve an approved/published version ID and serve retained content; they do not generate from mutable live rows on GET.

### 8. Add delivery tracking

Initial scope may support manual download and recorded manual send if production email remains blocked. When email delivery is enabled:

- use the approved recipient snapshot;
- record each attempt and outcome;
- retry without creating a new statement version;
- never include a public permanent Storage URL;
- make failed delivery actionable without changing statement financial status.

Delivery status does not change the financial calculation or close.

## Invariants to preserve

- One logical owner/property/period/currency statement with immutable numbered versions.
- Approved/published version lines and totals cannot change.
- Every line is supported by one or more frozen canonical source identities.
- Line totals reconcile exactly to the closed-period owner balance equation.
- Historical property, owner, contact, ownership, and display facts are snapshots.
- Published artifacts are retained, private, checksummed, and version-specific.
- Reissue creates a new version and preserves the old version.
- Owner-facing documents never expose raw IDs or internal accounting implementation.
- Delivery is separate from approval/publication.
- Statement output remains property accounting, not corporate P&L.

## Acceptance criteria

1. An open or in-review property period cannot generate an official statement draft.
2. One closed property period creates deterministic owner statement drafts for the frozen owner roster.
3. Re-running generation with the same close/source hash creates no duplicate version or lines.
4. Draft line totals equal section totals, closing owner balance, deposit disclosure, and the source manifest.
5. Approval rejects stale source hash, unresolved Critical exceptions, missing required recipient snapshot, or arithmetic mismatch.
6. Approved version rows and lines reject direct update/delete attempts at the database boundary.
7. Publishing stores one private, checksummed PDF/CSV per version and retries idempotently.
8. Download returns the retained artifact rather than recalculating current operational data.
9. Archiving a property/source, changing owner contact, or changing later ownership does not alter an existing version or artifact.
10. Reopening/re-closing and reissuing creates a new version, preserves the prior artifact, and records the reason/supersession chain.
11. Internal review has exact source links; owner-facing PDF has itemized readable lines without raw UUIDs or journal details.
12. Cross-organization, non-admin approval, direct-table mutation, stale-close, duplicate-publication, unauthorized-download, and artifact-path bypass attempts fail.

## Verification

Required evidence:

- RED regression proving the current live PDF changes or can omit evidence when mutable source state changes.
- Pure tests for statement line building, ordering, subtotals, rounding, ownership allocation, opening/closing balance, arrears disclosure, deposit disclosure, and version labels.
- pgTAP for logical/version uniqueness, line/source scope, immutable approved data, RLS, direct mutation bypass, approval state machine, source hash, version supersession, and delivery isolation.
- Vitest for loaders, actions, internal/source views, owner-facing sanitization, CSV safety, and retained-artifact download behavior.
- Full application tests, lint, TypeScript, and production build.
- Database reset, lint, generated types, and full pgTAP.
- Authenticated browser flow: closed period → generate draft → inspect sources → approve → publish → download → record/send delivery → reopen/re-close → reissue → inspect version history.
- PDF visual verification for realistic multi-page itemization, page breaks, long labels, and totals.
- Storage authorization and checksum verification.
- `git diff --check`.

## Scope exclusions

- No owner portal.
- No electronic signature or payment instruction workflow beyond required recipient snapshots.
- No public artifact URLs.
- No general document-generation platform.
- No company P&L or tax statement.
- No production migration/cutover of historical statements; Plan 12 owns it.
- No deletion of the old live report until the pilot cutover is accepted.

## Deliverables

- Append-only statement, version, line, source, and delivery migrations.
- Deterministic generation, approval, publication, reissue, cancellation, and delivery RPCs/services.
- Itemized owner-facing PDF/CSV generated from immutable rows.
- Private retained artifact storage and checked download endpoint.
- Statement history and internal review UI with exact sources.
- Compatibility transition for the current Owner Statement route/API.
- Full tests, generated types, browser/PDF evidence, and parity output.
- Draft PR; do not merge without review.

## Stop conditions

Stop if:

- statement generation still queries current mutable records as historical authority;
- an approved version or artifact can be overwritten;
- totals cannot reconcile exactly to close and owner balance;
- internal source evidence is discarded;
- owner-facing output remains one aggregate row without itemized activity;
- artifact access depends on a public URL or leaks another organization;
- reissue destroys prior history; or
- publication begins before the property-period close is authoritative.
