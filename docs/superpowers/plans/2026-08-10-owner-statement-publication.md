# Official Owner Statement Publication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` or `superpowers:executing-plans` to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Publish immutable, numbered Owner Statements with retained,
byte-stable PDF and Excel artifacts generated only from approved Track 4A
frozen close revisions.

**Architecture:** Add checked publication and artifact authority beside the
Track 4A close tables. One canonical TypeScript model maps only frozen close
history and source links; deterministic PDF and Open XML renderers consume
that model, and private authenticated routes return retained bytes only after
verifying stored SHA-256 and length. The existing live-data owner-statement
prototype is removed from production authority.

**Tech Stack:** PostgreSQL/Supabase migrations and pgTAP, Supabase private
Storage, Next.js App Router, TypeScript, deterministic PDF/Open XML generation,
Vitest, Node concurrency tests, Playwright, Poppler/PDF inspection, and bundled
`@oai/artifact-tool` for workbook inspection/render verification.

## Global Constraints

- Use `npx supabase migration new`; never edit an applied migration.
- Every exposed table uses RLS plus FORCE RLS. Public mutation RPCs are
  authenticated, checked, idempotent, tenant-scoped, and search-path locked;
  private helpers have no application-role execute grant.
- Preserve exact money as canonical decimal strings until deterministic
  renderer serialization. Do not pass authoritative money through JavaScript
  `number`.
- Statement numbers match `^OS-[0-9]{6}-[0-9A-F]{12}$` and never contain PII.
- Publication consumes only frozen close revision data. Live operational tables
  may not participate in statement reconstruction.
- PDF and XLSX bytes must be deterministic for a publication. ZIP timestamps,
  PDF metadata, row ordering, source ordering, and filenames are fixed by the
  canonical model.
- Only Super Admin publishes. Finance Manager and Finance Member read/download.
  Operations, unaffiliated, cross-tenant, anonymous, and service-role user
  contexts fail closed.
- Do not rerun the expensive full matrix before the single browser flow and
  pre-matrix focused gates are green.

---

### Task 1: Immutable publication and artifact authority

**Files:**
- Create through CLI: `supabase/migrations/*_owner_statement_publication.sql`
- Create: `supabase/tests/owner_statement_publication_test.sql`
- Modify: `src/types/database.generated.ts` through `npm run db:types`

**Interfaces:**
- Produces immutable `owner_statement_publications` and
  `owner_statement_artifacts` authority.
- Produces checked readiness, publish, artifact-registration, publication-read,
  and download-metadata RPCs whose money and hashes are returned as text.
- Consumes approved `owner_close_series`, `owner_close_revisions`,
  `owner_close_lines`, and `owner_close_line_sources` only.

- [ ] Write pgTAP RED for schema, uniqueness, immutability, number format,
  closed-current eligibility, exact replay/conflict, role/cross-tenant denial,
  supersession, frozen canonical hash, artifact uniqueness, and prior-retention.
- [ ] Run only `owner_statement_publication_test.sql` and retain the expected
  missing relation/function failures.
- [ ] Generate the migration with `npx supabase migration new
  owner_statement_publication` and implement the checked authority with
  canonical close/publication lock order and explicit grants/RLS.
- [ ] Prove the canonical publication payload and content hash are independently
  reproducible from frozen revision rows, with stable UUID/date/money/hash
  serialization and no live operational query.
- [ ] Run a clean local reset, regenerate types, and make the focused pgTAP
  contract green.

### Task 2: One canonical statement model and deterministic renderers

**Files:**
- Create: `src/features/reports/data/owner-statement-report.ts`
- Create: `src/features/reports/data/owner-statement-report.test.ts`
- Modify: `src/features/reports/data/pdf.ts`
- Modify: `src/features/reports/data/pdf.test.ts`
- Modify: `src/features/reports/data/excel.ts`
- Modify: `src/features/reports/data/excel.test.ts`
- Retire or rebuild: `src/features/reports/data/owner-statement.ts`
- Retire or rebuild: `src/features/reports/data/owner-statement-input.ts`
- Retire production authority: `src/features/finance/property-cash.ts`

**Interfaces:**
- Produces `OwnerStatementPublicationModel` with canonical metadata, components,
  ordered frozen lines, ordered source links, hashes, and supersession data.
- Produces `buildOwnerStatementPdf(model): Uint8Array` and
  `buildOwnerStatementXlsx(model): Uint8Array`.

- [ ] Write Vitest RED proving the loader accepts only revision/publication ID,
  rejects malformed or noncanonical money/hash/order, and never calls live
  report or property-cash loaders.
- [ ] Add deterministic PDF/XLSX byte snapshots, second-generation equality,
  SHA-256 equality, typed Excel money cells, statement/source/check sheets, and
  PDF source appendix/page-number assertions.
- [ ] Implement the canonical mapper and deterministic renderers with fixed
  metadata and stable ZIP/object ordering.
- [ ] Inspect every generated PDF page after Poppler rendering; extract and
  verify text/hash/page count with `pdfinfo`, `pdfplumber`, or `pypdf`.
- [ ] Import the generated XLSX with bundled `@oai/artifact-tool`, inspect key
  ranges and formulas, scan for formula errors, render every sheet, and fix
  clipping or type/format defects.

### Task 3: Private artifact persistence, downloads, and UI

**Files:**
- Modify: `src/features/reports/report-catalog.ts`
- Modify: `src/features/reports/report-catalog.test.ts`
- Modify: `src/features/reports/reports.types.ts`
- Modify: `src/features/reports/data/trusted-report.ts`
- Modify: `src/features/reports/data/report-documents.ts`
- Modify: `src/app/api/reports/pdf/route.ts`
- Modify: `src/app/api/reports/excel/route.ts`
- Modify: `src/features/owner-close/actions.ts`
- Modify: `src/features/owner-close/data/owner-close.ts`
- Modify: `src/features/owner-close/components/owner-close-screen.tsx`
- Test: focused route, action, loader, catalog, and component suites

**Interfaces:**
- Produces a Super Admin publish action with one stable idempotency key.
- Produces authorized publication/history/read-only download UI and protected
  PDF/XLSX routes that verify retained object bytes against immutable metadata.

- [ ] Write application RED for publish authorization, incomplete-artifact
  remediation, immutable no-overwrite paths, hash/size mismatch denial,
  Finance read-only download, Operations denial, and superseded disclosure.
- [ ] Add Owner Statement to the report catalog only through publication ID or
  closed revision ID; reject the legacy live-data filters as authority.
- [ ] Implement private artifact upload/registration with create-only paths and
  safe retry/cleanup of unregistered objects; never overwrite a registered
  object.
- [ ] Implement downloads that load immutable metadata, fetch retained bytes,
  verify SHA-256 and length, then return stable filename/content headers.
- [ ] Implement readiness, publish, revision/publication history, download, and
  source-drill-through UI with role-shaped controls.

### Task 4: Guarded fixture and redacted manual reconciliation

**Files:**
- Modify: `scripts/load-test-fixture.mjs`
- Create: `scripts/fixtures/owner-statement-publication.json`
- Create: `scripts/smoke-fixture-owner-statement-publication.mjs`
- Create: `scripts/owner-statement-publication-fixture-contract.node-test.mjs`
- Create: `docs/verification/owner-statement-redacted-reconciliation.md`

**Interfaces:**
- Produces one literal official publication with both retained artifacts and a
  zero-difference manual line/component/source oracle.

- [ ] Write the literal fixture contract RED before extending the guarded
  fixture.
- [ ] Publish through checked production entrypoints, not direct authority-table
  inserts, and pin statement number/content/PDF/XLSX hashes and byte lengths.
- [ ] Reconcile opening, each frozen line, all four closing components, source
  counts, and artifact metadata to an independently calculated redacted manual
  oracle with zero unexplained difference.
- [ ] Prove reset/reload stability and no change to approved Track 2/3/4A
  fixture hashes.

### Task 5: Concurrency and complete browser acceptance

**Files:**
- Create: `scripts/owner-statement-publication-concurrency.node-test.mjs`
- Create: `scripts/smoke-owner-statement-browser-acceptance.mjs`
- Create: `scripts/owner-statement-browser-contract.node-test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces retained real-session races and one complete authenticated milestone
  flow.

- [ ] Write real two-session RED for publish/publish, publish/reopen,
  register/register, and superseding publication ordering with exact replay,
  no deadlock, no duplicate number/path, no pending idempotency, and no orphaned
  authoritative artifact metadata.
- [ ] Make the race suite green using the canonical close/publication lock order.
- [ ] Run one exact-worktree browser flow: Super Admin publishes and downloads
  R1 PDF/XLSX; database hashes match bytes; reopen/reclose and publish R2;
  R2 supersedes R1; R1 bytes remain identical; Finance roles read/download;
  Operations roles are denied; fixture restores in `finally`.
- [ ] Batch-fix all browser findings and rerun only the affected complete flow.

### Task 6: One full matrix, correction batch, and milestone review

**Files:**
- Create: `docs/verification/track-4b-owner-statement-publication.md`
- Modify: `docs/verification/ips-operational-readiness-progress.md`

**Interfaces:**
- Produces the exact-head verification record and independent milestone verdict.

- [ ] After focused preflight and browser acceptance are green, run the complete
  database, fixture, RLS/security, application, role, route, accessibility,
  concurrency, PDF/XLSX, build, and diff matrix once.
- [ ] Collect all scoped findings before changing code. Fix accounting,
  authorization, tenant isolation, evidence integrity, idempotency,
  concurrency, artifact-retention, and byte-stability defects together.
- [ ] Rerun only affected gates and one final focused re-review. Put unrelated
  cosmetic/legacy findings in the existing release backlog.
- [ ] Commit one clean implementation milestone and assign one independent
  reviewer. Track 5 remains blocked until no Critical or Important finding
  remains.

