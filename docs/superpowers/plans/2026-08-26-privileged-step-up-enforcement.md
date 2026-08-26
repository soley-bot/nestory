# Privileged Email Step-Up Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the staged Resend email-only grant authoritative for privileged organization mutations while preserving ordinary delegated workflows and separately authorized no-session jobs.

**Architecture:** One forward-only migration adds a parameterized exact-session predicate, an authenticated-request trigger on every organization-scoped public table, a Storage trigger, and a service-role-only assertion RPC. A server-only guard applies that assertion before every human-triggered service-role mutation. Policy rows remain absent/default-off.

**Tech Stack:** Next.js 16.3.1 App Router, TypeScript, Supabase Auth/Postgres/Storage, Resend, Vitest, pgTAP.

**Spec:** `docs/superpowers/specs/2026-08-26-privileged-step-up-enforcement-design.md`

## Global constraints

- Do not edit any existing migration. Create the enforcement migration with `supabase migration new` after observing the RED pgTAP failures.
- Do not access hosted Supabase, create policy rows, push, merge, deploy, use Vercel, or change hosted Auth/Resend settings.
- Do not touch upload/PDF validation or CI workflow hardening.
- Do not call this Supabase MFA/AAL2 or add another second-step channel.
- Fail closed for privileged human mutations when an organization policy is enabled; preserve ordinary authorized members and separately authorized system jobs.

---

### Task 1: Database-authoritative RPC, REST, and Storage enforcement

**Files:**
- Create: `supabase/tests/privileged_email_step_up_enforcement_test.sql`
- Create with Supabase CLI: `supabase/migrations/<timestamp>_privileged_email_step_up_enforcement.sql`
- Regenerate: `src/types/database.generated.ts`

**Interfaces:**
- Produces: `app_private.privileged_email_step_up_satisfied_for_actor(organization_id, user_id, session_id)`.
- Replaces forward-only: `app_private.current_privileged_email_step_up_satisfied(organization_id)` so it delegates to the explicit predicate.
- Produces: a service-role-only public assertion/check RPC for a trusted server-derived actor/session.
- Produces: organization mutation and `storage.objects` enforcement triggers.

- [x] Write pgTAP tests that enable a fixture policy and prove no-grant direct RPC denial, exact-session success, expired/revoked/different-session denial, malformed/missing-session denial, and ordinary delegated member success.
- [x] Add representative direct REST/RLS and Storage INSERT/UPDATE/DELETE tests plus a trigger-coverage assertion over every current organization-scoped public table.
- [x] Add privilege tests proving only `service_role` can execute the explicit assertion RPC and all five staged lifecycle RPCs retain service-role-only execution.
- [x] Run the focused pgTAP file and record the expected missing-object or missing-enforcement RED failure.
- [x] Run `supabase migration new --help`, create the migration with `supabase migration new privileged_email_step_up_enforcement`, and implement the minimum predicates, RPC, and triggers without policy rows.
- [x] Reset/apply only local disposable Supabase state as needed, regenerate database types, and run the staged plus enforcement pgTAP files GREEN.
- [x] Run migration discipline, database contract, full pgTAP, and local database lint checks attributable to this task.

### Task 2: Exact-session guard for human service-role mutations

**Files:**
- Create: `src/lib/auth/privileged-step-up-guard.ts`
- Create: `src/lib/auth/privileged-step-up-guard.test.ts`
- Modify: `src/features/organization/actions.ts`
- Modify: `src/features/finance-operations/paid-cost-evidence.ts`
- Modify: `src/features/finance-operations/documents/commercial-document-artifacts.ts`
- Modify: `src/features/owner-close/actions.ts`
- Modify focused tests for those modules only as required.

**Interfaces:**
- Produces: a server-only assertion that accepts expected server-derived organization/actor context, derives the current verified user and JWT session, and calls the service-role-only database assertion before mutation.
- Consumes: the Task 1 assertion RPC.

- [x] Write unit tests for missing claims/session, actor mismatch, RPC false/error, exact valid actor/session, and ordinary-member compatibility.
- [x] Write boundary-order tests proving invitation delivery, paid-cost evidence, commercial artifact publication, and owner-close publication cannot reach admin/email/Storage side effects before the assertion succeeds.
- [x] Run focused tests and record the expected missing-guard or call-order RED failures.
- [x] Implement the guard and wire only human-triggered service-role mutation boundaries; keep challenge lifecycle, public intake, auth bookkeeping, cron, provisioning, cleanup, read-only downloads, and fixtures explicitly separate.
- [x] Run the focused guard and service-bridge tests GREEN.

### Task 3: Reconciliation, regression, and handoff

**Files:**
- Modify only files required by failures attributable to Tasks 1-2.

- [x] Reconcile the final diff against both privileged-application and database-authority inventories; document any intentionally separate system path or residual gap.
- [x] Run relevant full unit, database, contracts, ESLint, TypeScript, build, and `git diff --check` gates.
- [x] Run independent spec-compliance and code-quality reviews and resolve every in-scope finding.
- [x] Confirm the diff contains no hosted policy row, hosted mutation, upload/PDF validation change, CI workflow hardening, deploy metadata, or unrelated user work.
- [x] Commit only this lane and report exact SHA, changed files, verified coverage, residual unprotected paths, and intentionally unperformed deployment/operator steps.
