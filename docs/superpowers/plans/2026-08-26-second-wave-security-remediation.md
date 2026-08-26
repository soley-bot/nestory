# Second-wave Security Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate and narrowly remediate non-duplicate platform, configuration, observability, resource-abuse, CI, and package-script security gaps on baseline `7c79b342761e5320379b10b298221703570a2cdb`.

**Architecture:** Keep configuration contracts executable and close to their production boundary. Use current Next.js 16.3.1 and GitHub Actions semantics, preserve existing auth and database ownership, and add no hosted dependencies or state.

**Tech Stack:** Next.js 16.3.1, TypeScript, Vitest 4, Node.js test runner, GitHub Actions.

**Spec:** Codex delegation from source task `01a0399f-c4ef-7c61-ac67-05ab8e9c99b6`; the complete constraints are copied below because no repository spec file was provided.

## Global Constraints

- Start from exact baseline `7c79b342761e5320379b10b298221703570a2cdb` and commit only this lane.
- Delegate independent reviews for config/headers/env/CI/logging and cron/uploads/resource exhaustion/cache/observability.
- Read `AGENTS.md` and the installed Next.js 16.3.1 guides before code changes; use current official primary docs for platform behavior.
- Validate concrete exploitability and false-positive risk; reject unproven hypotheses.
- For each validated issue, write and observe a failing RED unit or contract test before implementation.
- Do not edit Supabase migrations/RLS or identity/server-action authorization.
- Do not install services, mutate hosted state, push, merge, deploy, or use Vercel.
- Run focused and repository-wide gates, request independent review, then commit exact local work.

---

### Task 1: Independent evidence review and issue validation

**Files:**
- Read: `AGENTS.md`
- Read: `next.config.ts`
- Read: `.github/workflows/ci.yml`
- Read: `src/lib/security/browser-security.ts`
- Read: `src/lib/observability/sentry-options.ts`
- Read: `src/lib/uploads/upload-content.ts`
- Read: `src/app/api/cron/maintenance/route.ts`
- Read: `scripts/*.mjs`

**Interfaces:**
- Consumes: exact detached baseline and current official framework documentation.
- Produces: ranked findings with exploit path, root cause, false-positive analysis, test location, and narrow fix shape.

- [x] **Step 1: Dispatch the config/headers/env/CI/logging review**

Require read-only output with exact file/line evidence, rejected hypotheses, and no edits.

- [x] **Step 2: Dispatch the cron/uploads/resource/cache/observability review**

Require read-only output with exact file/line evidence, rejected hypotheses, and no edits.

- [x] **Step 3: Reproduce every candidate locally**

Use executable config/functions or official workflow semantics. Reject style-only findings and assumptions that cannot reach a user, operator, shared runner, or production resource boundary.

### Task 2: Remove unused remote image optimization exposure

**Files:**
- Modify: `next.config.ts`
- Modify: `next.config.test.ts`
- Modify: `src/lib/security/browser-security.ts`
- Modify: `src/lib/security/browser-security.test.ts`

**Interfaces:**
- Consumes: the complete inventory of `next/image` sources and Next.js 16.3.1 image configuration semantics.
- Produces: a config with no remote optimizer origin when all runtime external images are explicitly `unoptimized`, plus a CSP without the unused origin.

- [x] **Step 1: Write the failing config contract**

Add a test asserting `nextConfig.images?.remotePatterns` is empty or absent because Nestory has no optimized remote image source. This must fail against the baseline Unsplash allowlist.

- [x] **Step 2: Run the focused test and confirm RED**

Run: `npm test -- next.config.test.ts`

Expected: failure showing `images.unsplash.com` remains optimizer-eligible.

- [x] **Step 3: Remove only the unused optimizer and CSP origin**

Delete the remote pattern from `next.config.ts` and the matching `img-src` source from `browser-security.ts`; retain local static optimization and unoptimized signed-upload rendering.

- [x] **Step 4: Run the focused config and CSP tests**

Run: `npm test -- next.config.test.ts src/lib/security/browser-security.test.ts`

Expected: both test files pass.

### Task 3: Protect secret-bearing HTTP clients

**Files:**
- Modify: `src/lib/db/env.ts`
- Create: `src/lib/db/env.test.ts`
- Modify: `scripts/run-maintenance-automation.mjs`
- Modify: `scripts/maintenance-automation-runner.node-test.mjs`

**Interfaces:**
- Produces: HTTPS-only remote Supabase and maintenance endpoints while retaining HTTP loopback/local-container development.

- [x] **Step 1: Write distinct failing contracts for Supabase and maintenance URLs**
- [x] **Step 2: Confirm both RED tests reject neither remote plaintext URL on the baseline**
- [x] **Step 3: Add origin-only URL validation without reflecting URLs or secrets in errors**
- [x] **Step 4: Run both focused suites GREEN**

### Task 4: Close deterministic scanner and database-log leaks

**Files:**
- Modify: `scripts/secret-scan-core.mjs`
- Modify: `scripts/security-guardrails.node-test.mjs`
- Modify: `src/features/imports/actions.ts`
- Modify: `src/features/imports/actions.test.ts`
- Modify: `src/features/marketing/request-actions.ts`
- Modify: `src/features/marketing/request-actions.test.ts`

**Interfaces:**
- Produces: detection of declaration-prefixed sensitive assignments and non-placeholder secrets beginning with common environment prefixes; structured DB logging limited to a stable safe error code.

- [x] **Step 1: Add failing bypass and private-error logging tests**
- [x] **Step 2: Confirm both focused suites RED**
- [x] **Step 3: Narrow placeholder matching and redact the PostgREST error objects**
- [x] **Step 4: Run both focused suites GREEN**

### Task 5: Bound image decoding and CSV preview work

**Files:**
- Modify: `src/lib/uploads/upload-content.ts`
- Modify: `src/lib/uploads/upload-content.test.ts`
- Modify: `src/features/imports/unit-import.ts`
- Modify: `src/features/imports/unit-import.test.ts`
- Modify: `src/features/imports/components/import-preview-screen.tsx`

**Interfaces:**
- Produces: explicit decoded image pixel/dimension caps before full decode, bounded decode output, and CSV byte/row/column/cell limits before browser preview allocation.

- [x] **Step 1: Add failing compressed-image and CSV-limit behavior tests**
- [x] **Step 2: Confirm focused suites RED**
- [x] **Step 3: Enforce shared business limits before expensive work**
- [x] **Step 4: Run focused suites GREEN, including corrupt-image coverage**

### Task 6: Fail closed before property mutation smoke reaches a hosted target

**Files:**
- Create: `scripts/smoke-properties-flow-policy.mjs`
- Create: `scripts/smoke-properties-flow-policy.node-test.mjs`
- Modify: `scripts/smoke-properties-flow.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `validateLocalBaseUrl(value: string): string` from `scripts/smoke-ui-redesign-policy.mjs`.
- Produces: `resolvePropertiesFlowConfig(environment)` returning a loopback URL and local fixture credentials only after `ALLOW_LOCAL_MUTATION_SMOKE=1`.

- [x] **Step 1: Write failing policy and executable-script tests**

Cover missing mutation opt-in, a hosted HTTPS target, a credential-bearing URL, and the valid loopback fixture case. Execute the real smoke entry point for fail-before-browser behavior.

- [x] **Step 2: Run the focused test and confirm RED**

Run: `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test scripts/smoke-properties-flow-policy.node-test.mjs`

Expected: hosted/missing-opt-in cases do not produce the required fail-closed messages.

- [x] **Step 3: Implement the minimal resolver and wire it before browser launch**

Require `ALLOW_LOCAL_MUTATION_SMOKE=1`, reuse the loopback URL validator, and keep the existing local fixture defaults. Do not change the UI journey.

- [x] **Step 4: Add the contract to `test:contracts` and run it**

Run: `npm run test:contracts`

Expected: pass with the new policy test included.

### Task 7: Preserve validated release and observability contracts

- [x] **Step 1: Reject changing `production_database.needs` absent a violated repo invariant**

The protected schema-first workflow intentionally serializes the production database release behind its database validation job; application deployment independently waits on both application and database checks. Generic coupling is not evidence of a security defect.

- [x] **Step 2: Reject the proposed Sentry transaction leak**

The installed SDK emits route templates for transaction names, and Nestory's event scrubber removes raw request URL/path/query fields. Keep dashboard-side quotas and project privacy controls as residual operations hardening.

### Task 8: Repository verification, independent review, and exact commit

**Files:**
- Review: all files changed since `7c79b342761e5320379b10b298221703570a2cdb`

**Interfaces:**
- Consumes: focused GREEN checks and independent audit reports.
- Produces: one local commit and an evidence-led handoff.

- [x] **Step 1: Run repository-wide gates**

Run the security, lint, type, bounded full unit/UI, and contract gates. Per coordinator direction, defer the native-root build until after integration.

- [x] **Step 2: Request independent code review**

Give the reviewer the exact baseline, diff, requirements, test evidence, and prohibited scopes. Resolve all Critical/Important findings or document evidence-based rejection.

- [x] **Step 3: Verify scope and working tree**

Run: `git diff --check`, `git diff --stat 7c79b342`, `git status --short`, and inspect every changed file. Confirm no Supabase migration/RLS/auth-owned file changed.

- [x] **Step 4: Commit only this lane**

Create one local commit with no push, merge, deploy, hosted mutation, or Vercel interaction. Report exact SHA, severities, exploit paths, checks, and dashboard-only residual hardening.
