# Request and Identity Boundary Remediation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development to implement each remediation from a failing test, and superpowers:verification-before-completion before claiming completion.

**Goal:** Close validated second-wave request-boundary bypasses without changing database policy, dependencies, hosted configuration, or deployment state.

**Architecture:** Every exported Server Function must derive organization and user authority from the current request. Client-facing actions translate backend and provider failures into stable application messages. Auth entry routes consume recovery credentials only after an app-owned, same-origin confirmation and produce private, non-cacheable redirects from a configured application origin.

**Tech Stack:** Next.js 16.3.1 App Router, TypeScript, Supabase Auth/Postgres, Resend, Vitest.

## Constraints

- Do not edit Supabase migrations/RLS, package manifests, CI, or hosted settings.
- Do not send email, push, merge, deploy, or call hosted Supabase/Vercel.
- Preserve the existing host-scoped workspace resolver and invitation binding.
- Implement only independently reproduced findings from the parallel audits.

### Task 1: Server-derived privileged step-up status scope

**Files:**
- Modify: `src/features/auth/privileged-step-up.test.ts`
- Modify: `src/features/auth/privileged-step-up.ts`
- Modify: `src/app/(dashboard)/account/page.tsx`

- [x] Add a failing test proving caller-supplied organization/user context cannot reach the service-role status RPC.
- [x] Run the focused test and capture the unauthorized organization arguments.
- [x] Make the exported Server Function accept no authority arguments and derive context from `requireWorkspaceContext()`.
- [x] Run the focused test and confirm only request-derived organization/user/session values reach the RPC.

### Task 2: Backend and provider error confidentiality

**Files:**
- Modify: `src/features/finance-operations/actions.test.ts`
- Modify: `src/features/finance-operations/actions.ts`
- Modify: `src/features/maintenance/actions.test.ts`
- Modify: `src/features/maintenance/actions.ts`

- [x] Add failing action tests with sentinel RPC/storage error detail and prove it is currently serialized to the client.
- [x] Run the focused tests and capture the disclosure failures.
- [x] Preserve allowlisted business messages while mapping unknown backend/provider failures to stable generic action messages.
- [x] Run focused finance and maintenance tests and confirm the sentinels are absent.

### Task 3: Recovery confirmation request boundary

**Files:**
- Modify: `src/features/auth/auth-entry-routes.test.ts`
- Modify: `src/app/auth/confirm/route.ts`
- Modify as needed: `src/lib/auth/redirect.ts`
- Modify as needed: `src/lib/auth/callback-url.ts`

- [x] Add failing tests proving GET cannot directly consume a recovery token and cross-origin POST cannot create a recovery session.
- [x] Add failing tests for private no-store auth redirects and configured-origin redirect construction if the independent audit confirms those paths are exploitable.
- [x] Run the focused auth-entry tests and capture the failures.
- [x] Route recovery GET through the explicit confirmation page, enforce same-origin POST, and apply the minimum validated redirect/cache hardening.
- [x] Run focused auth callback, session, redirect, proxy, recovery, and invitation tests.

### Task 4: Bounded auth request parsing and cookie integrity

**Files:**
- Create: `src/lib/http/bounded-request-body.ts`
- Create: `src/lib/http/bounded-request-body.test.ts`
- Modify: `src/features/auth/implicit-session-route.test.ts`
- Modify: `src/app/auth/session/route.ts`
- Modify: `src/lib/auth/tenant.test.ts`
- Modify: `src/lib/auth/tenant.ts`

- [x] Add failing tests for oversized declared bodies and oversized missing-length streams returning 413 before Auth client creation.
- [x] Add failing tests proving `/auth/confirm` accepts only bounded URL-encoded form bodies and `/auth/session` accepts only bounded JSON.
- [x] Add a failing test proving client-declared `type: recovery` cannot mint a recovery marker from an ordinary implicit session.
- [x] Add failing cookie-option tests for HttpOnly, SameSite=Lax, production Secure, and the existing parent-domain scope.
- [x] Implement one bounded streaming reader, route-specific byte limits/content types, a non-recovery implicit type allowlist, and secure server-only Auth cookie options.
- [x] Run focused reader, auth route, callback, recovery, cookie, and proxy tests.

### Task 5: Regression and commit gates

- [x] Re-run all focused security tests from Tasks 1-4.
- [x] Run the broad unit/contract suite, lint, TypeScript, and build tiers available from the existing dependency tree.
  - Default Turbopack was blocked by the worktree's out-of-root dependency junction; the webpack fallback produced no source diagnostic but was stopped on coordinator instruction so integration can run the native-root build.
- [x] Run `git diff --check`, inspect the full diff, and verify no forbidden file or hosted mutation occurred.
- [x] Reconcile the final diff with both independent reviewers and resolve every validated finding.
- [x] Create one local commit and report its exact SHA, test evidence, exploit paths, severities, and residual hosted settings.
