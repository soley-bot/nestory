# DoorLoop search research and Nestory application

Reviewed 27 September 2026 using DoorLoop's public help documentation. This is a workflow comparison, not a review of a signed-in DoorLoop account or its internal search algorithm.

## Documented patterns

- [Global search](https://support.doorloop.com/en/articles/8868458-search-doorloop-using-global-search): a persistent control at the top of the app, opening a search overlay for properties, units, leases, people and tasks, plus page/report navigation and creation shortcuts. Accounting transactions and document contents are outside its stated scope.
- [Finding a lease](https://support.doorloop.com/en/articles/8826515-search-for-a-specific-lease): tenant lookup can return both a person and their lease; an address lookup can return a property and related units. Registers provide additional filters.
- [2024 improvements](https://support.doorloop.com/en/articles/10290628-doorloop-software-updates-for-2024): global lookup by email and phone, and removable filter chips. Payee/reference/memo searches are described for the expense/bill payee picker, not as global transaction search.
- [Tenant search](https://support.doorloop.com/en/articles/6187715-find-sort-and-filter-your-tenants): partial names are supported; current/past/future filters explain why a tenant may be absent from a register.

## Applied to Nestory

- A visible desktop search trigger; compact icon retained on small screens.
- Results grouped into Properties, Units, People, Leases, Tasks & cases, Documents and Pages. Page actions stay local and do not consume server record slots.
- People lookup includes display/legal name and primary email/phone. Properties include name, code and address. Units and leases can be found through related properties; unit and lease results display property context.
- Literal words match across the result's searchable fields in any order. Exact matches are recovered even when an alphabetical candidate query fills its limit.
- The preview shows every returned record, with room reserved for different record types. Permission-scoped register links retain the search text and provide a path to filters and more results.
- Failed categories no longer discard successful categories; partial and bounded responses are identified explicitly.
- People, Properties, Units and Leases use the same 500 ms live-search hook. Enter submits immediately; composition and older URL responses do not overwrite newer input.

Grouping, the timing choice, partial-result handling and category reservation are Nestory design decisions informed by the research, not claims about DoorLoop's exact behavior.

## Boundaries

Search remains read-only and uses the signed-in Supabase client, organization filters, existing RLS and task assignment restrictions. No schema, hosted database or financial mutation is involved. Archived records remain a register-filter workflow; ended but unarchived leases remain eligible. Owner records remain internal company records.

This is a bounded quick lookup: each field retrieves up to 100 candidates using the longest query word, then matches all words after relationship enrichment. Saturated lookups report that the preview is limited, and the register links offer further searching. It is not full-text indexing, typo correction, document-content search or a global accounting search. Contact matching is literal and does not remove phone punctuation. Register searches can include additional workflow-specific fields.

## Validation

- 165 tests passed across 12 files covering search, API authorization/error handling, register interactions and affected data loaders.
- TypeScript (`tsc --noEmit --incremental false`), targeted ESLint and `git diff --check` passed.
- Browser component preview used synthetic records at 1280 x 800 and 390 x 844. Confirmed grouped results, property context, scrollable results, keyboard selection/navigation, focus return and no horizontal overflow at the mobile breakpoint.
- The preview did not query a hosted database. Signed-in hosted runtime behavior and production performance have not been certified. No deployment was performed.

## Page-search follow-up

The register controls also differed: Ledger, Timeline, Documents, Maintenance and Rent required submission, while finance lists filtered immediately. These URL-backed registers now use the same 500 ms live-search hook as People, Properties, Units and Leases, with Enter to apply immediately and composition-aware typing. SearchCombo now provides a named search region and a clear-query button. Clearing the query keeps other filters; Documents no longer drops its lease/task scope when searching.

Rent invoices, chart of accounts, expenses and transactions now match all query words across their searchable fields, regardless of order. Finance list controls use the same SearchCombo appearance and clear action. Existing locally loaded finance lists still filter immediately; this does not expand their loaded date/history scope.

Validation: page/component suites and transaction regression checks passed (226 tests); an additional Rent integration test verifies live search and clearing while preserving property/status filters. TypeScript and targeted ESLint passed. Reports retain their existing whole-form Apply workflow. No production deployment or authenticated live-data verification was performed.

## Pilot property / unit / owner matching — 27 September 2026

Read-only inspection of the linked Nestory project, restricted to organization slug `pilot`, found 72 active properties, 89 active units and 76 distinct owners with active ownership links. No search actions were present in the pilot activity log, and no search-history instrumentation was found in the application. These records establish naming patterns, not observed search frequency.

The pilot uses different property aliases, owner display names, and unit labels. Some identifiers contain `#`, periods and hyphens; some imported owner names contain literal escaped tab separators. Shared matching now recognizes these formatting differences and follows the explicit property/unit/owner relationships.

Implemented scope:
- Properties can be found by property name/code, linked owner or a unit belonging to the property.
- Units, Leases, Ledger, Timeline, Documents and Maintenance match property/name/code, their own unit and linked owners before pagination where those registers use server queries.
- People search includes the units belonging to an owner's linked properties.
- Rent, Expenses and Transactions include owner labels from the existing authorized finance context, including additional active owners. Their existing date/status/history scope and financial amounts are preserved.
- Global lookup uses the same context where the caller has portfolio search permissions. Task-only roles retain their existing directory boundary. An unavailable relationship context produces partial-search feedback while preserving direct matches.

Validation:
- 735 matching checks against a temporary read-only snapshot of all 72 pilot properties and 89 units passed. The snapshot was removed after verification; no raw pilot fixture is tracked.
- 506 tests across 32 files passed, followed by 18 global-search tests after adding one more failure-recovery regression (507 distinct tests across these runs).
- TypeScript, ESLint and whitespace checks passed.
- Synthetic fixtures cover distinct property/owner aliases, sibling-unit exclusion, secondary-owner rent lookup, imported whitespace, punctuation variants, organization isolation, pagination beyond the first 500 reference rows, and unavailable owner context.

Limits: pilot Documents and Tasks currently contain no records, so their matching was covered by synthetic fixtures. There was no authenticated browser verification of the updated application against hosted data. The reference reader is bounded at 10,000 rows per table and reports a failure rather than silently returning a truncated search context. No schema changes, hosted writes or deployment were performed.

Implementation reference: Supabase documents that raw OR filters require PostgREST syntax and sanitization: https://supabase.com/docs/reference/javascript/using-filters-or . The shared query builder quotes values and escapes LIKE wildcards.
