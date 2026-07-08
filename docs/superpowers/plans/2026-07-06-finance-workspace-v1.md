# Finance Workspace v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace shallow Finance destinations with real money-in, money-out, and ledger-control workflows.

**Architecture:** Finance uses workflow records for expected incoming and outgoing money, then posts confirmed rows into the existing ledger. Ledger remains the official financial history; Rent & Income and Bills & Expenses are operating queues.

**Tech Stack:** Next.js App Router, Supabase RPCs/RLS, TypeScript, existing Nestory UI primitives.

## Global Constraints

- Finance nav becomes Dashboard, Rent & Income, Bills & Expenses, Leases, Ledger, Petty Cash.
- `/payments` redirects to `/rent-income`; `/invoices` redirects to `/bills-expenses`.
- Incoming money belongs in Rent & Income; outgoing money belongs in Bills & Expenses; confirmed money posts to Ledger.
- No external payment processor, bank feed, or double-entry engine in this slice.
- All money workflow writes stay organization-scoped, RPC-backed, audit logged, and blocked by ledger period locks when posting.

---

## Tasks

- [ ] Add `finance_income_items` and `finance_expense_items` tables, RLS, indexes, and RPCs.
- [ ] Implement `src/features/rent-income` with filters, data loading, actions, table, inspector, and drawer forms.
- [ ] Implement `src/features/bills-expenses` with filters, data loading, actions, table, inspector, and drawer forms.
- [ ] Update Finance navigation, compatibility redirects, Finance Dashboard links, Ledger month-close context, and docs.
- [ ] Run lint, typecheck, focused tests, Supabase checks where available, and authenticated browser smoke.
