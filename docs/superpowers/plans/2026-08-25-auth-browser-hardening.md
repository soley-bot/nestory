# Authentication and Browser Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce password and browser hardening while installing a dormant, email-only privileged step-up path that cannot be misrepresented as Supabase AAL2.

**Architecture:** Next.js Proxy owns per-request nonce/CSP propagation and `next.config.ts` owns stable headers. A forward-only private Supabase schema and service-role-only RPCs own challenge/grant state; server actions derive authority from the current host/session and use Resend only when configured. Mandatory database authorization integration remains a later rollout gate.

**Tech Stack:** Next.js 16.3.1 App Router, React 19, TypeScript, Supabase Auth/Postgres, Resend, Vitest, pgTAP.

**Spec:** `docs/superpowers/specs/2026-08-25-auth-browser-hardening-design.md`

## Global Constraints

- Do not push, merge, deploy, alter hosted Auth/Resend settings, or write hosted Supabase.
- Do not describe email step-up as MFA or AAL2; do not add phone or user-facing TOTP.
- Preserve invitation binding, recovery markers, host-scoped auth, `/auth/session`, RLS, and ordinary access.
- Use only a new forward-only migration and leave mandatory enforcement off.

---

### Task 1: Browser security policy

**Files:**
- Create: `src/lib/security/browser-security.ts`
- Create: `src/lib/security/browser-security.test.ts`
- Modify: `src/proxy.ts`
- Modify: `src/proxy.test.ts`
- Modify: `next.config.ts`
- Modify: `src/app/layout.tsx`
- Create: `src/app/layout.test.tsx`

**Interfaces:**
- Produces: `buildContentSecurityPolicy()`, `BROWSER_SECURITY_HEADERS`, and request/response nonce propagation.

- [x] Write tests proving exact-origin CSP construction, production/dev differences, distinct nonces, cookie-refresh/header preservation, stable headers, and theme-script nonce use.
- [x] Run the focused tests and confirm the expected missing-policy failures.
- [x] Implement the pure policy builder, Proxy decoration, static headers, and async nonce-aware layout.
- [x] Run the focused tests and confirm they pass.

### Task 2: Password policy

**Files:**
- Create: `src/lib/auth/password-policy.ts`
- Create: `src/lib/auth/password-policy.test.ts`
- Modify: `src/features/auth/actions.ts`
- Modify: `src/features/auth/invitation-acceptance.ts`
- Modify: `src/features/auth/auth-recovery-actions.test.ts`
- Modify: `src/features/auth/invitation-acceptance.test.ts`
- Modify: `supabase/config.toml`

**Interfaces:**
- Produces: one shared new-password schema matching the source-controlled Auth policy.

- [x] Write tests rejecting short or composition-deficient new passwords while keeping ordinary password login validation unchanged.
- [x] Run the tests and confirm current eight-character validation fails them.
- [x] Implement the shared policy and set local Auth minimum/composition requirements.
- [x] Run focused application tests and a local Auth weak-password rejection check.

### Task 3: Private challenge and grant lifecycle

**Files:**
- Create: `supabase/tests/privileged_email_step_up_test.sql`
- Create with Supabase CLI: `supabase/migrations/<timestamp>_privileged_email_step_up.sql`

**Interfaces:**
- Produces: service-role-only prepare/deliver/fail/verify/status RPCs plus dormant enforcement predicates.

- [x] Write pgTAP tests for privilege classification, private records, throttling, attempt exhaustion, delivery gating, replay prevention, exact session/organization grants, session revocation, and enforcement-off compatibility.
- [x] Run the focused database test and confirm missing objects fail.
- [x] Create the migration through `supabase migration new` and implement the minimum private schema/RPCs.
- [x] Run the focused database test and confirm it passes.

### Task 4: Resend service and Account UI

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.env.example`
- Create: `src/features/auth/privileged-step-up.ts`
- Create: `src/features/auth/privileged-step-up.test.ts`
- Create: `src/features/account/components/privileged-email-step-up.tsx`
- Create: `src/lib/auth/privileged-step-up-crypto.ts`
- Create: `src/lib/auth/privileged-step-up-crypto.test.ts`
- Modify: `src/app/(dashboard)/account/page.tsx`
- Modify: `src/features/account/components/account-screen.tsx`
- Modify: `src/features/account/components/account-screen.test.tsx`

**Interfaces:**
- Consumes: the service-role-only lifecycle RPCs from Task 3.
- Produces: request/verify server actions and a privileged-only Account panel.

- [x] Write tests proving server-derived identity, generic errors, no grant after delivery failure, exact Resend recipient, and staged copy/state.
- [x] Run focused tests and confirm the service/UI is missing.
- [x] Add the pinned Resend dependency, server-only env parsing, actions, and Account panel.
- [x] Run focused tests and confirm they pass.

### Task 5: Regression and completion gates

**Files:**
- Modify only files required by failures attributable to Tasks 1-4.

- [x] Run focused auth, invitation, recovery, host, proxy, account, finance-context, and step-up tests.
- [x] Run migration discipline, local pgTAP/database checks, and database lint.
- [x] Run full unit/UI/contracts tests, ESLint, TypeScript, build, and `git diff --check`.
- [x] Ask the independent reviewer to inspect the final diff and personally resolve every finding.
- [x] Review staged/enforced claims against the design, then create one local commit and report its exact SHA.
