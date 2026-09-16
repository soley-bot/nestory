# Owner transaction correction implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement and review the bounded financial tasks below.

**Goal:** Put a discoverable transaction action menu on owner-account rows and extend corrections beyond distribution dates to date, amount, and reference, using each source's authoritative correction workflow.

**Architecture:** The owner account is a projection. Commands must target real source records, preserve original history, check permissions and closed periods, and update reports through existing accounting authority. A menu opens a source-specific workflow; it must never edit the projected ledger row directly.

**Tech stack:** Next.js/React, Radix, Supabase PostgreSQL, Vitest and pgTAP.

**Spec:** User screenshot and follow-up selecting new correction fields, 16 September 2026. Preserve financial data during live verification. Release through protected main CI only.

## Global constraints

- No edits to published migrations. One local schema writer; no hosted writes from checkout.
- No live financial corrections during testing.
- Reversals remain visible and cannot be corrected again; replacement records remain actionable.
- Date, exact decimal amount, reference and required correction reason need validation. Show a before/after review before confirmation.
- Rent and expense corrections reuse their existing validated replacement/reversal flows. No arbitrary changes to recognized management fees: open the lease's correction workflow.

## Task 1 — Cash correction authority

- [x] Inspect current withdrawal correction and owner cash event lifecycle. Extend distribution corrections with a new forward-only RPC supporting date, amount and reference; retain old RPC compatibility.
- [x] Preserve original cash reservations and reject closed periods, stale/reversed originals, unknown records, unauthorized callers, invalid amounts, future dates, and insufficient historical cash.
- [x] Determine the safe owner contribution correction path and implement using authoritative reversal/replacement semantics; report exact interface to UI integration.
- [x] Add pgTAP tests for success, unchanged input, increased/reduced amounts, reference-only changes, replay/conflicting replay, history, ownership and insufficient cash. Run local schema tests and generated-type parity; serialize all database work.

## Task 2 — Row menu and correction forms

- [x] Add a final Actions column with an accessible ellipsis menu and transaction details for every row.
- [x] Route correction actions to typed authoritative sources. Never guess an ID from amounts/dates. Use existing rent/payment and expense correction screens where applicable.
- [x] Extend owner cash form with date/amount/reference and a before/after review, keeping required correction reason separate from owner-facing reference.
- [x] Test keyboard menu, close/reopen state, permissions, reversal rows, source routing, exact amount validation, review invalidation and server errors.

## Task 3 — Verification and release

- [x] Fresh independent review of schema and UI, address actionable findings.
- [ ] Run focused tests, lint, types; full PR CI including clean schema replay and contracts.
- [ ] Merge and release through exact-main protected workflow. Confirm hosted parity and pilot preservation, deployment SHA and clean worktree.
- [ ] Live read-only menu/form verification; do not confirm a real correction. Save acceptance evidence.

## Verification notes

- Owner cash action/form focused tests: 31 passed. Broader owner-balances tests: 209 passed.
- Database: 57 new correction assertions passed; local lint passed. Full local suite encountered seven fixture-dependent failures; no local reset/reseed performed. Clean CI fixture replay is required before release.
- Independent review found and corrected UI branch-lock matching; contribution helper's legacy cross-branch lock check was corrected with a regression test.
- Existing date-only distribution API is retained. Contributions reject correction while active payments consume their cash; no automatic reassignment of those payments.
