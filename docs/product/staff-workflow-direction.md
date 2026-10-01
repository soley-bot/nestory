# Staff Workflow Product Direction

Approved direction: 2026-10-01. Baseline inspected: main
`eddf073c9a41274ee8a73914751afa8a0271d351`.
This change revises documentation and product priorities only. It changes no
runtime behavior, role grant, database policy, financial formula or deployment
gate. [`PROJECT.md`](../../PROJECT.md) distinguishes the direction from the
implemented contract. Earlier design goals remain historical evidence.

## Desired Experience

Staff should find the right property, unit, person or lease quickly and finish
work from that context. A collections row should lead to receiving rent or
correcting that charge; a repair should lead to assignment, evidence and Finance
handoff; an owner question should lead to understandable activity and the
retained statement. Keep the selected property, period and return destination.

Prefer sensible defaults and short initial forms, with additional fields when
needed. Keep identity, money and meaningful consequences visible. Explain
blocked actions in staff language and provide a permitted recovery route. A
reason and before/after preview are useful for material corrections; avoid
requesting administrator confirmation for every reversible profile edit.

Use little text. Prefer familiar labels, a short result and an actionable error;
remove repeated explanations and place secondary help on demand. Replace
implementation terms in ordinary screens: “Charge” instead of “Obligation”,
“Receive payment” instead of “Record settlement”, and “Change history” instead
of “Correction lineage”. Keep the precise domain terms in code and contracts.
An error such as “This month is locked. Ask an authorized administrator to
unlock it.” is useful only where that is the actual allowed recovery; map each
error to its real permitted next step.

Do not shorten away amount, date, property, result, accessible field names or
essential financial distinctions. Charge, payment, credit, refund and reversal
are different actions. A live report and a saved official statement are
different evidence. Choose labels that help staff understand these differences
without explaining database machinery.

Speed is part of correctness: a stale form or wrong-scope cached result is a
workflow defect. Render the requested register page first, load secondary work
independently or on intent, and cancel obsolete requests. Background loading is
acceptable only through a bounded authorized loader; it must not repeat an
entire portfolio load. Measure loader calls, payload and time to usable rows
separately. Keep full-scope financial aggregates independent from page rows.

## Restriction Replacement Matrix

The left column identifies existing guidance or observed behavior, not a claim
that every restriction is still enforced. The replacement column is product
direction. Availability is governed by the current code and the status column.

| Existing rule or friction | Replacement direction | Status and boundary |
| --- | --- | --- |
| Treat the project contract and old design checklist as permanent product scope. | Revise product rules when staff evidence supports a simpler workflow; record the replacement and its acceptance criteria. | Documentation revised now. Runtime contracts remain authoritative for availability. |
| PROJECT says Super Admin creates leases; routine corrections may be hidden under administrative management. | Place routine actions at their source and use explicit staff capabilities within assigned scope. | Lease preparation wording corrected to existing permission semantics. PR175 implements the specifically approved current-month Finance Manager rent correction. No additional role grants. |
| Narrow correction paths fail closed without a clear repair route. | Guided correction: select the source, enter the change and reason, preview the effect, validate dependencies, save audit lineage and show the result. | Existing safe correction machinery is the starting point. New correction types are planned; missing authority continues to block until implemented. |
| Archive/restore is the only normal lifecycle; every deletion waits for an unspecified decision. | Keep archive/restore for established records; design checked deletion for unused drafts, and use void/reversal/replacement for financial mistakes. | Draft deletion and consistent undo are planned. No referenced or financial evidence is erased, and no new hard-delete API is authorized by this document. |
| Read-only Ledger can be mistaken for a ban on correcting money records. | Offer correction from the operational source and show the resulting history in Ledger and reports. | Ledger projection remains immutable. Source corrections retain reason, preview, payments and dependencies. |
| Initial records and queues wait for hidden dropdowns, histories and portfolio datasets. | Minimum visible data first, independent aggregates, on-intent forms/history/media, then one bounded next-page load when useful. | People Insights streaming and PR185 Unit options on intent are implemented. PR184 pagination remains a separate pending release at this checkpoint. Finance and derived register fallbacks remain planned. |
| At most one secondary controls row; never keep a persistent inspector. | Use these as defaults, with an accessible comparison panel or extra controls when a demonstrated task needs them. | Documentation relaxed now. UI changes still need task, keyboard and zoom evidence. |
| Repeated paragraphs and accounting/implementation jargon compensate for unclear screens. | Use familiar labels, short actionable errors and secondary help on demand; make the affected scope and consequence clear. | Direction revised now. Audit copy alongside each workflow slice; retain accessible labels and financial distinctions. |
| Current report catalog, monthly-only setup and browser-only reminders read as permanent prohibitions. | Treat them as current gaps. Add a report or durable workflow when its sources, operating need and delivery model are defined. | Roadmap only. No accounting books, automation, portal, external messages or payment integration added. |
| Ordinary users have one active branch; exceptional historical and closed-period authority is restricted. | Improve navigation and escalation within current scope; consider any expanded assignment or recovery model as a specific business decision. | Current policy retained. No cross-property reads, broad admin capability, or closed-month reopening rights granted. |
| Large screens and shared loaders absorb each new feature as another conditional. | Split cohesive queries, summaries, forms and correction flows; share proven primitives, validation and typed error mapping. | Engineering priority now; implement in small reviewed slices with behavior-preserving tests. |

## Invariants And Decisions

These are retained even when a restriction is replaced:

- Authenticate the actor and derive organization, property/branch scope and
  capabilities on the server. Repeat checks in RLS and checked mutation RPCs.
  Navigation, browser inputs and People roles do not grant authority.
- Preserve source identity, exact-decimal money, payment/allocation links,
  meaningful audit evidence and correction/reversal lineage. A retained official
  statement is tied to its immutable revision; a live report is distinct.
- Keep preview/version validation, payload idempotency, serialized financial
  writes, overpayment and owner-cash dependency guards. No silently fabricated
  balance, settlement, allocation, recipient or opening authority.
- Keep existing financial locks, owner close/reopen rights and maker-checker
  separation. Improved UX must make the reason and permitted next step clear.
- Keep private evidence, final-admin protection, migration history, exact-head
  CI/review, protected branches and the serialized protected database release.
  A test or a merge alone is not evidence that an alias is live.
- Use synthetic or disposable resources for tests. Do not reset an unverified
  shared database or use customer financial records for write-based tests.

Deposit use/replenishment, allocation or refund rules, historical editing
rights, closed-period reopening, currencies, multi-branch assignments and new
payment/communications services need specific product decisions before their
business behavior changes. Broad approval of this direction does not decide
them, buy a service, authorize downtime or waive security.

## Architecture Debt Priorities

Priorities come from the inspected source, not a line-count target. Split by
responsibility and keep each feature's database authority intact.

| Priority | Evidence and next slice | Proof required |
| --- | --- | --- |
| 1 — Finance reads and work surface | `getFinanceOperationsData` supplies a broad shared dataset before the Work pager. Split a page query, selected-scope aggregates and on-intent form/detail options. Compose Finance work, accounts and corrections as separate feature modules rather than adding branches to the central screen. | Page/request-count tests, equal complete-scope totals, preserved filter/sort/URL, role and property boundaries, stale-result and browser checks. |
| 2 — Properties/Units register fallbacks | Simple lists already use DB paging; portfolio search and derived filters/sorts can load full matching sets. Move each confirmed fallback to a bounded server projection/query before adding prefetch. | Matching order/counts versus the prior loader, page clamp, active/archived and cross-scope cases, before/after query and payload measurements. |
| 3 — Detail data and form boundaries | Unit records currently compose history, files, photos and summaries in the core loader. PR185 separates form options. Apply the same separation where Property/detail evidence confirms unused work. | Initial requests omit hidden datasets; opening the section still shows complete authorized data; request cancellation and scope changes remain correct. |
| 4 — Correction and maintenance modules | Maintenance screen mixes register, form and workflow rendering; lease actions and finance correction code carry several command families. Extract focused modules and confirmed duplicated builders without creating a general workflow engine. | Existing command results, audit lineage and permission/dependency checks stay equivalent. Targeted forms, RPC contracts and concurrency cases pass. |
| 5 — Shared validation and error presentation | Inventory repeated amount/date/identity validation, option loading and raw database-error guidance. Use stable typed domain errors and shared UI only where semantics agree. | Equivalent valid/invalid cases, stable public error codes, useful guidance, no private error leakage and no changed business validation. |

Keep list queries, aggregates and detail/form queries explicit at server loader
boundaries. Let PostgreSQL own protected money, history and idempotency; do not
duplicate that authority in React. Use smaller cohesive modules and shared
controls rather than wrappers that only rename a primitive. Remove duplication
after confirming its semantics. Review the actual diff and preserve behavior
with before/after cases; a smaller file alone is not proof of better code.

Avoid a big-bang rewrite, broad cosmetic churn, unrelated cleanup and speculative
abstractions. Separate refactor commits/PRs from changed business behavior where
practical. Follow the owner's preference against explanatory code comments.

## Phased Implementation

| Phase | Bounded delivery | Exit evidence |
| --- | --- | --- |
| 0 — Direction and baseline | Merge this documentation separately. Inventory common staff tasks, observed blockers, current authority and release states. Prioritize with the pilot; distinguish software release from an operator's financial correction. | Agreed task list, baseline requests/payload and permitted synthetic scenarios; no new business permission implied. |
| 1 — Fast visible work | Build on released PR185 Unit options, complete the separate PR184 pagination release, then split one Finance or register loader at a time. Defer hidden forms/history/media, preserve separate aggregates, and add bounded cancelable prefetch only after its loader is safe. | Time to usable rows and payload measured honestly; equivalent totals/scope/sort/page/URL; slow/error/stale/cancel browser cases. |
| 2 — Routine edits and recoveries | Inventory existing edit/correction/archive/restore commands. Put actions at source rows and records. Consolidate reason/preview/result presentation and readable dependency guidance without changing command authority. | Increase/decrease, unpaid/partial/paid, duplicate, stale, dependent cash, closed period, audit, future terms and denied-role/property cases. |
| 3 — Audited lifecycle improvements | Design unused-draft deletion and consistent recovery/undo against explicit dependency and retention contracts. Implement one record family at a time after deciding its semantics. | Server-enforced eligibility, concurrency and idempotency; audit/tombstone and restore expectations; preserved referenced evidence. |
| 4 — Capability and product expansion | Decide specific historical/deposit/assignment policies and select valuable reporting, recurrence or communication work. Design the required backend, authority and operating model before enabling it. | Recorded business decisions, financial/role contracts, service cost and authorization where applicable, focused migration and release evidence. |

Every slice includes code-quality work tied to that responsibility, focused
regressions and exact-commit review. Expand tests according to the changed
behavior; do not repeatedly run the full suite for documentation edits. Production
delivery follows the existing protected queue and exact SHA/alias verification.

## DoorLoop References And Adaptation

Primary pages inspected on 2026-10-01. The following are observed reference
patterns; the Nestory adaptations and roadmap are our product decisions.

- DoorLoop describes a lease-context payment form with tenant/account defaults
  and an option to allocate against chosen charges. Adopt contextual defaults
  and understandable payment placement. Nestory retains its checked allocation
  and receiving-account model; this does not add DoorLoop payment automation.
  [Receive a Payment on a Lease](https://support.doorloop.com/en/articles/6162667-receive-a-payment-on-a-lease).
- DoorLoop's audit report provides searchable actor/time and field-level
  before/after history, including updates and deletions. Adopt visible change
  history as the companion to easier corrections. Nestory's financial evidence
  still uses retained source and reversal/supersession chains.
  [Audit Log Report](https://support.doorloop.com/en/articles/14489347-audit-log-report-track-every-change-in-your-account).
- DoorLoop groups maintenance requests, assignment and progress/cost tracking
  into a work-order journey. Adopt a clear staff handoff and relevant context;
  keep Nestory's separate Finance review. Portals, automatic messages and vendor
  payments are future decisions, not implied features.
  [Maintenance workflow](https://www.doorloop.com/features/work-orders).

The preference for little text and little jargon is the product owner's
direction. Public help articles explain workflows at length; their availability
does not establish how much copy DoorLoop's authenticated screens contain.
Evaluate Nestory's screen copy in real staff tasks rather than asserting an
unverified competitor-interface benchmark.

Older local [owner-reporting research](../design/2026-09-07-doorloop-owner-reporting.md)
and [search research](../research/doorloop-search.md) remain useful evidence.
Do not import a competitor's financial semantics, permissions, branding or
marketing performance claims as Nestory requirements.

## Implemented Versus Planned At This Checkpoint

- This PR implements the documentation direction, revised product defaults,
  restriction matrix, architecture priorities and phased roadmap only.
- Existing main code implements the specifically approved Finance Manager
  current-month correction and its audits and safeguards. It does not imply
  historical-period authority. Other released corrections remain governed by
  their checked contracts.
- PR185 (Unit options on intent) is implemented and released at main
  `bd49dc1b1485cd373052a4d0039414dd5c11f9df`. Protected workflow
  [36880716182](https://github.com/soley-bot/nestory/actions/runs/36880716182)
  passed all deployment and preservation gates. Both production aliases were
  verified READY on that SHA on 2026-10-01.
- PR184 (10-row People default) remains a separate implementation PR at this
  checkpoint. Its exact-head CI, review and protected release must complete
  before claiming it is live.
- Finance query separation, general audited draft deletion/undo, broader
  corrections, durable automation and new financial policies are planned.
  No runtime refactor or policy change is concealed in this documentation PR.
