# Plan 01 — Financial Inventory, Parity Diagnostics, and Safety Rails

**Mode:** Standard  
**Effort:** High  
**Reason:** Before changing financial writes, Nestory needs a read-only, exact inventory of every current representation, bypass path, inferred historical row, and report contradiction.  
**Authorization:** This is the first and only implementation slice authorized for prompt preparation. It does not authorize Plan 02.

## Context and baseline

Planning baseline is merged `main` at `823deb4735b8124edefd1e68e451c21f1962b075`. The implementation branch must instead record the latest merged `main` SHA at start and stop if relevant finance code has changed materially.

Verified current behavior:

- Owner Statement reads obligations, receipt/payment allocations, deposit events, and ownership.
- Property records and several performance/reporting paths read `ledger_entries`.
- Accounting journals maintain a separate control representation.
- Maintenance and petty cash may create Ledger/journal effects without matching Owner Statement settlement sources.
- Expense payment recording and expense Ledger/journal posting are separable.
- Direct Data API grants and generic Ledger/journal RPCs may bypass intended domain authority.
- Historical `BACKFILL-INCOME-*` and `BACKFILL-EXPENSE-*` settlement rows may use due/invoice fallback dates rather than evidenced cash dates.
- Existing fixture evidence demonstrated a property/month where Ledger reported rent while Owner Statement reported zero and still reported readiness.

This plan changes no financial write behavior and mutates no business data.

## Objective

Build an organization-scoped reconciliation toolkit that produces two deliberately separate outputs:

1. **Current-state inventory:** exact facts about records, grants, links, dates, totals, report sources, locks, and mismatches.
2. **Proposed canonical classification:** a non-authoritative recommendation describing how each source could map into the ratified future contract.

Never present the proposed classification as current truth. Ambiguity remains explicit.

## Required changes

### 1. Add a read-only diagnostic boundary

Prefer a checked set-returning SQL function or `security_invoker` view plus a feature-owned TypeScript loader. It must be read-only and emit one stable diagnostic row per issue.

Each row includes:

- stable diagnostic key;
- organization and property;
- optional unit, lease, task, owner, tenant, vendor, obligation, settlement, Ledger, and journal IDs;
- current source type/id and exact operator/developer source link;
- issue code and severity;
- event, obligation, due/invoice, and inferred-date fields kept distinct;
- currency and exact obligation/settlement/Ledger/journal amounts;
- reconciliation-source state;
- current lock state for property, organization Ledger period, and accounting book period where applicable;
- affected reporting surfaces;
- whether the issue affects operating income, expense, deposit custody, management fees, owner liability, reconciliation, close, or statement publication;
- deterministic explanation;
- proposed resolution class, explicitly labeled non-authoritative.

### 2. Inventory current-state issue classes

At minimum detect:

- receipt allocation without exact Ledger projection;
- receipt allocation without exact journal projection;
- payment allocation without exact Ledger projection;
- payment allocation without exact journal projection;
- obligation compatibility amount/status mismatch;
- obligation-level projection that cannot represent multiple settlement events;
- source-linked Ledger row without canonical settlement identity;
- manual Ledger row;
- maintenance Ledger row linked only through `tasks.ledger_entry_id`;
- maintenance and bill possible duplicate;
- petty-cash projection missing or possible duplicate;
- petty-cash row using invoice date where cash/disbursement date is unproven;
- deposit income without deposit event;
- deposit event without supported receipt/cash evidence;
- owner contribution written through more than one authority;
- owner payout/expense state without a distribution authority;
- management-fee obligation without reproducible agreement/assessment evidence;
- journal without operational source;
- Ledger/journal amount, date, property, unit, source, or reversal mismatch;
- generic Ledger or journal source namespace that can impersonate a domain projection;
- ownership invalid or ambiguous on candidate allocation date;
- archived source still financially effective;
- archived historical owner/contact omitted from live statement inputs;
- report-source contradiction among Owner Statement, property record, Property/Unit Performance, Income & Expense, Ledger, and journal controls;
- property lock, organization Ledger lock, and book-period lock disagreement;
- missing stable reconciliation/cash-source identity;
- `BACKFILL-INCOME-*` or `BACKFILL-EXPENSE-*` row with inferred due/invoice fallback date;
- duplicate effect across settlement, Ledger, maintenance, petty cash, deposit, fee, or owner-cash source;
- canonical candidate that exceeds configured pagination/report caps;
- direct table privilege or public/generic RPC path capable of bypassing intended authority.

Use valid implementation identifiers; this list is the required semantic coverage, not a required SQL enum spelling.

### 3. Build deterministic parity summaries

For every selected organization/property/currency/period, show gross totals by current source and a separately labeled proposed de-duplicated total for:

- operating cash received;
- tenant charge and outstanding balance context;
- property expenses paid;
- maintenance and petty-cash effects;
- security-deposit custody;
- management-fee effects;
- owner contributions and payouts;
- Ledger income/expense;
- journal debit/credit control totals;
- unresolved diagnostics by severity;
- current report totals from each named financial read path.

Do not silently choose one source as truth. A proposed de-duplicated result must list every included/excluded typed source and confidence/resolution state.

### 4. Inventory grants and bypass paths

Produce exact evidence for:

- table privileges for `anon`, `authenticated`, admin, manager, and member fixtures;
- RLS visibility and write policies;
- public versus private RPC execute privileges;
- direct DML attempts against finance items, allocations, Ledger rows, journals, deposits, petty cash, and related sources;
- generic Ledger update/archive and generic journal post/reverse behavior against domain-linked/reserved-source rows;
- cross-organization and same-organization/wrong-property link attempts.

This is inventory only. Do not revoke grants or change guards in Plan 01.

### 5. Add an internal execution command

Add an engineering-only command such as:

```text
npm run finance:inventory
```

The command must:

- require an explicit environment/project identity;
- default to local/test fixture execution;
- require organization, property, currency, and period scope;
- fail closed when scope or project identity is absent or mismatched;
- accept optional source/issue filters;
- paginate/cursor beyond PostgREST 1,000 and current report 5,000 caps without silent truncation;
- write normalized JSON and Markdown under ignored `artifacts/finance-inventory/<timestamp>/`;
- include source counts, amount totals, query contract version, repository SHA, schema/migration identity, parameters, and source watermark/hash;
- detect source changes during or after analysis and mark the run stale rather than presenting a mixed snapshot;
- omit secrets, signed URLs, owner payment instructions, and unnecessary personal data;
- return non-zero in `--strict` mode when Critical issues exist.

Production/preview execution is not authorized by this plan. It requires separate explicit authorization and environment safeguards.

### 6. Add an isolated production-shaped fixture

Create a test-only fixture isolated from fixed seed IDs and existing local user state. It must include:

- active monthly lease and generated rent obligation;
- partial and final receipt;
- approved expense with partial and final payment;
- maintenance cost posted directly to Ledger;
- cleared petty-cash property expense;
- deposit receipt and refund/reversal;
- management-fee compatibility row without agreement evidence;
- owner contribution through the current income path;
- owner payout compatibility row;
- manual Ledger row;
- `BACKFILL-*` row with inferred fallback date;
- reversed receipt and payment;
- one valid and one ambiguous ownership history;
- one archived historical owner/contact used by a past event;
- mismatched organization/property lock state;
- enough generated rows to prove pagination beyond configured caps.

The fixture deliberately creates known mismatches so RED diagnostics prove coverage. It is never a production backfill fixture.

### 7. Define a stable artifact contract

Normalized JSON must be deterministic apart from explicit run metadata. Stable rows sort by documented typed identity and issue key. Amounts use exact decimal/string representation rather than floating-point output.

Each proposed classification uses one of:

- `exact_existing_link`;
- `candidate_controlled_adjustment`;
- `candidate_explicit_exclusion`;
- `ambiguous_requires_resolution`;
- `inferred_date_requires_evidence`;
- `unsupported_current_source`.

These are diagnostics, not mutation instructions.

## Invariants to preserve

- Entire plan is read-only for business data.
- Existing UI totals and write behavior remain unchanged.
- No row is repaired, relinked, archived, reversed, classified as authoritative, or backfilled.
- No report read path is cut over.
- No grant, RLS policy, trigger, RPC, migration history, or production configuration is changed except append-only read-only diagnostic schema required for the tool.
- Organization/role isolation applies to diagnostic SQL and application loaders.
- Actual cash dates and inferred fallback dates remain distinct.
- Reversals remain separate dated records.
- Archived/reversed historical rows remain visible to diagnostics when financially relevant.
- No assumption that settlements, Ledger, or journals are already authoritative.

## Acceptance criteria

1. One explicit command produces current-state inventory and separately labeled proposed classification for a selected local/test scope.
2. Every deliberately seeded mismatch is detected with exact typed source links and expected severity.
3. The known Ledger-versus-Owner-Statement contradiction appears explicitly.
4. `BACKFILL-*` fallback-dated rows are labeled inferred and unresolved.
5. Direct privilege, DML, public/private RPC, generic Ledger/journal, and cross-organization bypass evidence is captured.
6. Clean fully linked fixture events do not produce a false Critical issue.
7. The tool processes more than PostgREST 1,000 and report 5,000 rows without truncation.
8. A source change makes a run stale/fail-closed rather than mixing snapshots.
9. Re-running unchanged data produces byte-stable normalized JSON apart from explicit metadata.
10. No current write, report total, production data, or deployment changes.

## Verification

Required evidence:

- RED pgTAP/Vitest coverage for every Critical semantic issue class.
- GREEN focused SQL and TypeScript tests.
- Test-only fixture isolation proof.
- `has_table_privilege`, `has_function_privilege`, RLS visibility, private-helper denial, direct DML, direct RPC, role matrix, cross-organization, and wrong-linked-record tests.
- Pagination tests above 1,000 and 5,000 rows.
- Stale/source-change and environment/project mismatch tests.
- Exact-money and deterministic artifact tests.
- Full `npm run test`.
- `npm run lint`.
- `npx tsc --noEmit`.
- `npm run build`.
- `npm run db:reset`.
- `npm run db:lint`.
- `npm run db:types` plus generated-type drift check.
- Full `npx supabase test db --local supabase/tests`.
- `git diff --check`.

Browser verification is not required unless an admin UI is added. A permanent diagnostic dashboard is discouraged.

## Scope exclusions

- No canonical event read contract implementation beyond diagnostic normalization.
- No authority kernel, source write, settlement, reversal, lock, fee, deposit, owner-balance, close, statement, artifact, report-cutover, migration, or backfill change.
- No automatic repair or fuzzy matching.
- No production/preview diagnostic execution without explicit authorization.
- No deployment.
- No Plan 02 authorization.

## Deliverables

- Append-only read-only diagnostic migration/view/RPC where necessary.
- Feature-owned types, loader, normalization, and issue taxonomy.
- `finance:inventory` command and deterministic artifact schema.
- Isolated production-shaped mismatch fixture.
- Focused Vitest and pgTAP coverage.
- Current-state inventory documentation and proposed-classification disclaimer.
- Draft PR with exact latest-main baseline, changed files, RED/GREEN evidence, checks, branch/remote parity, and no merge request.

## Stop conditions

Stop and return findings without continuing if:

- a material source family cannot be identified exactly;
- a diagnostic requires mutating records;
- duplicates cannot be distinguished from legitimate independent events without fuzzy inference;
- archived/reversed sources disappear from historical evidence;
- the result depends on an unbounded in-memory load or default API cap;
- the command cannot prove project/environment identity;
- a run cannot detect source changes/staleness;
- current merged `main` contains a new financial path not covered by this plan; or
- the implementation begins changing authority rather than inventorying it.
