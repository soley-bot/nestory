# Sentry Observability and Guarded Autofix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver privacy-scrubbed Sentry error reporting for Nestory and an hourly local Codex automation that triages one verified low-risk production error into a reviewable pull request.

**Architecture:** Provision Sentry through the linked Vercel project, then wrap the official Next.js SDK with small Nestory-owned configuration and redaction helpers. A deterministic Node.js CLI will retrieve one unresolved issue while emitting only allowlisted metadata, enforce protected-domain rules, and resolve only an explicitly identified issue; a Codex project automation will own code diagnosis, isolated-worktree changes, verification, and a non-force feature-branch pull request. A human-reviewed merge remains required before production checks and issue resolution.

**Tech Stack:** Next.js 16.3.1, React 19.2.7, `@sentry/nextjs`, TypeScript 5, Vitest 4, Node.js 24 test runner, Vercel CLI, Sentry REST API, Codex local project automation.

**Spec:** `docs/superpowers/specs/2026-08-20-sentry-observability-and-autofix-design.md`

## Global Constraints

- Capture error events while keeping performance tracing disabled until a separate transaction and span privacy contract is implemented and reviewed.
- Keep Session Replay and Sentry debug logging disabled.
- Never send names, email addresses, cookies, authorization headers, request bodies, form values, financial values, query strings, or secrets.
- Allowed custom context is stable internal user ID, organization ID, fixed role, normalized route pattern, environment, and release SHA.
- Missing Sentry configuration must never break local development, tests, CI, or application startup.
- The automation processes at most one issue per run and never force-pushes, bypasses gates, or modifies another task's worktree.
- Auth, permissions, RLS, migrations, financial workflows, environment settings, integrations, dependency-major upgrades, destructive operations, and ambiguous failures require user authorization.
- Direct-to-main automation is forbidden; every proposed fix must use an isolated branch and pull request.

---

### Task 1: Provision the Real Sentry Integration and Lock the SDK

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.env.example`
- Inspect without committing secrets: `.env.local`, `.vercel/project.json`

**Interfaces:**
- Consumes: linked Vercel project `nestory` and user authorization for Sentry account claim when requested.
- Produces: installed `@sentry/nextjs`, Vercel-provided `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`, and DSN environment names; no secret values enter Git.

- [ ] **Step 1: Install the global Vercel CLI and verify the executable**

Run:

```powershell
npm i -g vercel
Get-Command vercel -All
vercel --version
```

Expected: the global install exits 0 and `vercel --version` prints a version compatible with the repository's Vercel 54 dependency.

- [ ] **Step 2: Provision Sentry through the linked Vercel project**

Run:

```powershell
vercel integration add sentry --yes --no-claim
```

Expected: either the integration is attached or the CLI prints a browser/account claim URL. Pause for the user to complete that exact authorization, then rerun `vercel integration list` and require Sentry to appear.

- [ ] **Step 3: Pull environment values without displaying secret contents**

Run:

```powershell
vercel env pull .env.local --yes
vercel env ls
```

Expected: the pull succeeds and `vercel env ls` shows only environment variable names. Do not print `.env.local`.

- [ ] **Step 4: Install the SDK using the official Sentry/Vercel wizard**

Run the guide command with the organization and project identifiers supplied by the integration:

```powershell
npx @sentry/wizard@latest -i nextjs --saas --org $env:SENTRY_ORG --project $env:SENTRY_PROJECT --coming-from vercel
```

Expected: `@sentry/nextjs` is locked in `package.json` and `package-lock.json`, and the wizard creates the SDK entry files. Reject sample routes and replay defaults that violate the spec.

- [ ] **Step 5: Document names, never values**

Add these names to `.env.example` with empty values and comments that distinguish runtime ingestion, build-time source maps, and automation access:

```dotenv
NEXT_PUBLIC_SENTRY_DSN=
SENTRY_ORG=
SENTRY_PROJECT=
SENTRY_AUTH_TOKEN=
SENTRY_AUTOFIX_TOKEN=
SENTRY_AUTOFIX_API_BASE=https://sentry.io
```

- [ ] **Step 6: Verify the dependency and secret boundary**

Run:

```powershell
npm ls @sentry/nextjs
git diff --check
git diff -- . ':!.env.local'
git status --short
```

Expected: the SDK resolves, `.env.local` is not staged or printed, and only intended source/configuration files are changed.

- [ ] **Step 7: Commit the provisioned dependency checkpoint**

```powershell
git add package.json package-lock.json .env.example
git commit -m "chore: provision Sentry SDK"
```

### Task 2: Add Privacy-Safe SDK Configuration and Workspace Identity

**Files:**
- Create: `src/lib/observability/sentry-options.ts`
- Create: `src/lib/observability/sentry-options.test.ts`
- Create: `src/components/observability/sentry-identity.tsx`
- Create: `src/components/observability/sentry-identity.test.tsx`
- Modify: `src/app/(dashboard)/layout.tsx`
- Modify: `instrumentation-client.ts`
- Modify: `sentry.server.config.ts`
- Modify if generated: `sentry.edge.config.ts`
- Modify: `instrumentation.ts`
- Modify: `next.config.ts`

**Interfaces:**
- Consumes: `WorkspaceRole`, authenticated `userId`, `organizationId`, SDK environment variables, and `Sentry.ErrorEvent`.
- Produces: `buildSentryOptions(runtime: "client" | "server" | "edge"): BrowserOptions | NodeOptions`, `scrubSentryEvent(event): event | null`, `normalizeSentryRoute(pathname): string`, and `<SentryIdentity userId organizationId role />`.

- [ ] **Step 1: Write failing redaction and configuration tests**

Create tests proving the public behavior:

```ts
it("removes request data and free-form identity while retaining safe tags", () => {
  const event = scrubSentryEvent({
    request: {
      cookies: { session: "secret" },
      data: { amount: "100.00", note: "private" },
      headers: { authorization: "Bearer secret", "user-agent": "browser" },
      query_string: "propertyId=private-id",
      url: "https://app.example/properties/private-id?tab=finance",
    },
    user: { email: "operator@example.com", id: "user-1", ip_address: "127.0.0.1", username: "Operator" },
    tags: { organization_id: "org-1", role: "finance_manager", route: "/properties/[propertyId]" },
  });

  expect(event?.request).toEqual({ headers: { "user-agent": "browser" }, url: "/properties/[propertyId]" });
  expect(event?.user).toEqual({ id: "user-1" });
  expect(event?.tags).toMatchObject({ organization_id: "org-1", role: "finance_manager" });
});

it("disables performance sampling and default PII", () => {
  expect(buildSentryOptions("client")).toMatchObject({
    debug: false,
    sendDefaultPii: false,
    tracesSampleRate: 0,
  });
});

it.each([
  ["/properties/95ac?tab=finance", "/properties/[propertyId]"],
  ["/leases/55/edit", "/leases/[leaseId]/edit"],
])("normalizes %s without retaining record ids", (input, expected) => {
  expect(normalizeSentryRoute(input)).toBe(expected);
});
```

- [ ] **Step 2: Run the tests and confirm the expected missing-module failure**

Run:

```powershell
npx vitest run src/lib/observability/sentry-options.test.ts
```

Expected: FAIL because `sentry-options.ts` does not exist.

- [ ] **Step 3: Implement the shared SDK options and scrubber**

Implement strict allowlisting: delete free-form message and exception values, request cookies, data, query string, authorization/cookie headers, user email/username/IP, breadcrumbs containing form or console payloads, and `extra`; replace event request URLs with `normalizeSentryRoute(new URL(url).pathname)`. Keep `tracesSampleRate` at `0` and do not register router-transition tracing. Use `process.env.VERCEL_ENV ?? process.env.NODE_ENV` and `process.env.VERCEL_GIT_COMMIT_SHA` for environment and release.

- [ ] **Step 4: Run the helper tests and make them pass**

Run:

```powershell
npx vitest run src/lib/observability/sentry-options.test.ts
```

Expected: all helper tests pass.

- [ ] **Step 5: Write the failing identity component test**

```tsx
it("sets only pseudonymous workspace identity and clears it on unmount", () => {
  const { unmount } = render(
    <SentryIdentity organizationId="org-1" role="finance_manager" userId="user-1" />,
  );
  expect(setUser).toHaveBeenCalledWith({ id: "user-1" });
  expect(setTags).toHaveBeenCalledWith({ organization_id: "org-1", role: "finance_manager" });
  unmount();
  expect(setUser).toHaveBeenLastCalledWith(null);
});
```

- [ ] **Step 6: Run the identity test and verify it fails**

Run:

```powershell
npx vitest run src/components/observability/sentry-identity.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 7: Implement and mount workspace identity**

Implement `SentryIdentity` as a client component using `Sentry.setUser` and `Sentry.setTags` inside an effect. Add `userId={context.userId}` to `AppShellProps`, render the identity component inside `AppShell`, and pass `context.userId` from `src/app/(dashboard)/layout.tsx`. Do not pass `userEmail` to Sentry.

- [ ] **Step 8: Configure all SDK entry points**

Call `Sentry.init(buildSentryOptions("client"))` from `instrumentation-client.ts`, server/edge equivalents from their generated files, export `onRequestError = Sentry.captureRequestError` from `instrumentation.ts`, and wrap `next.config.ts` with `withSentryConfig`. Keep SDK debug logging and Replay integrations absent; configure source maps for upload without exposing them in public build output.

- [ ] **Step 9: Verify the complete instrumentation slice**

Run:

```powershell
npx vitest run src/lib/observability/sentry-options.test.ts src/components/observability/sentry-identity.test.tsx src/components/layout/app-shell.test.tsx
npx tsc --noEmit
npm run lint
```

Expected: all targeted tests pass and TypeScript/lint exit 0.

- [ ] **Step 10: Commit the privacy-safe instrumentation**

```powershell
git add next.config.ts instrumentation.ts instrumentation-client.ts sentry.server.config.ts sentry.edge.config.ts src/lib/observability src/components/observability src/components/layout/app-shell.tsx src/components/layout/app-shell.test.tsx 'src/app/(dashboard)/layout.tsx'
git commit -m "feat: add privacy-safe Sentry instrumentation"
```

### Task 3: Report React Boundary Errors Without Changing Recovery UX

**Files:**
- Create: `src/app/global-error.tsx`
- Create: `src/app/global-error.test.tsx`
- Modify: `src/app/(dashboard)/error.tsx`
- Create: `src/app/(dashboard)/error.test.tsx`

**Interfaces:**
- Consumes: `Sentry.captureException(error)` and existing `ErrorState` retry behavior.
- Produces: root and dashboard React error boundaries that report each received exception once per mounted error instance.

- [ ] **Step 1: Write failing boundary tests**

```tsx
it("captures the dashboard error and retains retry", async () => {
  const error = new Error("controlled failure");
  const reset = vi.fn();
  const user = userEvent.setup();
  render(<DashboardError error={error} reset={reset} />);
  expect(captureException).toHaveBeenCalledWith(error);
  await user.click(screen.getByRole("button", { name: /try again/i }));
  expect(reset).toHaveBeenCalledOnce();
});

it("renders a complete html document and captures a root error", () => {
  const error = new Error("root failure");
  const { container } = render(<GlobalError error={error} reset={vi.fn()} />);
  expect(captureException).toHaveBeenCalledWith(error);
  expect(container.querySelector("html")).not.toBeNull();
});
```

- [ ] **Step 2: Run the boundary tests and verify failure**

Run:

```powershell
npx vitest run 'src/app/(dashboard)/error.test.tsx' src/app/global-error.test.tsx
```

Expected: FAIL because dashboard capture and the global boundary are absent.

- [ ] **Step 3: Implement boundary capture**

Use a client effect with the `error` object as its dependency to call `Sentry.captureException(error)`. Keep the current dashboard copy and retry control. Make `global-error.tsx` render `<html><body>` with a plain, accessible recovery view because the root layout may be unavailable.

- [ ] **Step 4: Run the boundary tests and verify success**

Run:

```powershell
npx vitest run 'src/app/(dashboard)/error.test.tsx' src/app/global-error.test.tsx
```

Expected: both boundary tests pass.

- [ ] **Step 5: Commit boundary reporting**

```powershell
git add 'src/app/(dashboard)/error.tsx' 'src/app/(dashboard)/error.test.tsx' src/app/global-error.tsx src/app/global-error.test.tsx
git commit -m "feat: report application boundary failures"
```

### Task 4: Build the Fail-Closed Sentry Issue CLI

**Files:**
- Create: `scripts/sentry-autofix.mjs`
- Create: `scripts/sentry-autofix.node-test.mjs`
- Modify: `package.json`
- Modify: `scripts/script-inventory.json` through the repository generator if required by its contract.

**Interfaces:**
- Consumes: `SENTRY_AUTOFIX_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, optional `SENTRY_AUTOFIX_API_BASE`, and Sentry organization issue APIs.
- Produces: `npm run sentry:autofix -- next`, `npm run sentry:autofix -- next --dry-run`, and `npm run sentry:autofix -- resolve <issueId> --release <sha>` with redacted JSON output and nonzero fail-closed exits.

- [ ] **Step 1: Write failing CLI contract tests**

Use a local HTTP server and child process to prove:

```js
test("next rejects absent credentials without making a request", async () => {
  const result = await runCli(["next"], { SENTRY_AUTOFIX_TOKEN: "" });
  assert.equal(result.code, 2);
  assert.match(result.stderr, /SENTRY_AUTOFIX_TOKEN/);
  assert.doesNotMatch(result.stderr, /Bearer/);
});

test("next emits one redacted low-risk issue", async () => {
  const result = await runCli(["next", "--dry-run"], fixtureEnvironment(server));
  const issue = JSON.parse(result.stdout);
  assert.equal(issue.id, "101");
  assert.equal(issue.disposition, "candidate");
  assert.equal(issue.event.user.email, undefined);
  assert.equal(issue.event.request.data, undefined);
});

test("next blocks protected-domain issue text", async () => {
  server.respondWithIssue({ title: "RLS policy rejected rent payment allocation" });
  const result = await runCli(["next", "--dry-run"], fixtureEnvironment(server));
  assert.equal(JSON.parse(result.stdout).disposition, "requires_authorization");
});

test("resolve requires both issue id and exact release sha", async () => {
  const result = await runCli(["resolve", "101"], fixtureEnvironment(server));
  assert.equal(result.code, 2);
  assert.equal(server.requests.length, 0);
});
```

- [ ] **Step 2: Run the CLI tests and verify the missing-script failure**

Run:

```powershell
node --test scripts/sentry-autofix.node-test.mjs
```

Expected: FAIL because `scripts/sentry-autofix.mjs` does not exist.

- [ ] **Step 3: Implement configuration and API boundaries**

Use `fetch` with bearer auth and `Accept: application/json`. `next` calls `/api/0/organizations/{org}/issues/?project={project}&environment=production&query=is:unresolved&sort=recommended&limit=10`, then fetches the latest event for candidates until one safe issue is found. Output only issue ID, short ID, title, culprit, counts, safe stack filenames/functions, release/environment tags, permalink, and disposition. Never output request bodies, user objects, breadcrumbs, cookies, headers, or raw event JSON.

- [ ] **Step 4: Implement the denylist and resolution gate**

Case-insensitively require authorization when issue title, culprit, stack path, or exception text references `supabase`, `migration`, `rls`, `policy`, `auth`, `invite`, `permission`, `role`, `organization`, `branch`, `rent`, `invoice`, `payment`, `expense`, `balance`, `owner`, `statement`, `deposit`, `ledger`, `reversal`, `secret`, `environment`, `vercel`, `sentry`, `delete`, `archive`, or `restore`. `resolve` sends `PUT /api/0/organizations/{org}/issues/{issueId}/` with `{ "status": "resolved", "statusDetails": { "inRelease": releaseSha } }` only when the SHA is exactly 40 lowercase hexadecimal characters.

- [ ] **Step 5: Run the CLI tests and verify success**

Run:

```powershell
node --test scripts/sentry-autofix.node-test.mjs
```

Expected: all CLI tests pass and no fixture secret appears in output.

- [ ] **Step 6: Register the command and inventory**

Add:

```json
"sentry:autofix": "node scripts/sentry-autofix.mjs"
```

Run the repository script inventory generator if `npm run test:contracts` reports the new script as unclassified, and commit the generated inventory change with this task.

- [ ] **Step 7: Verify and commit the CLI**

Run:

```powershell
node --test scripts/sentry-autofix.node-test.mjs
npm run test:contracts
git diff --check
```

Then commit:

```powershell
git add package.json scripts/sentry-autofix.mjs scripts/sentry-autofix.node-test.mjs scripts/script-inventory.json
git commit -m "feat: add guarded Sentry issue runner"
```

### Task 5: Create the Hourly Direct-Fix Automation and Verify the System

**Files:**
- Modify only if durable operator guidance is needed: `docs/superpowers/specs/2026-08-20-sentry-observability-and-autofix-design.md`
- External local state: Codex automation configuration for the `D:\nestory` project.
- External platform state: Sentry project, Vercel environment variables, production deployment, and one controlled verification event.

**Interfaces:**
- Consumes: the `sentry:autofix` CLI, Git credentials, Codex local project automation, existing CI deployment gates, and Vercel/Sentry access.
- Produces: an active hourly automation named `Nestory Sentry Autofix`, a verified Sentry event, a dry-run disposition report, and exact external authorization blockers if any remain.

- [ ] **Step 1: Run complete local verification before external activation**

Run:

```powershell
npm run lint
npx tsc --noEmit
npm run test:all
npm run build
git diff --check
```

Expected: every command exits 0. Do not activate pull-request creation while any command fails.

- [ ] **Step 2: Confirm non-force Git and deployment access without changing remote state**

Run:

```powershell
git fetch origin --prune
git status --short --branch
git rev-list --left-right --count origin/main...HEAD
gh auth status
vercel project inspect nestory
```

Expected: credentials are valid, the worktree is clean, and the branch provenance is explicit. Pause for user authorization if GitHub or Vercel rejects access.

- [ ] **Step 3: Create the Codex project automation**

Create an hourly local project automation with this behavioral core:

```text
Work in D:\nestory. Read PROJECT.md and the Sentry autofix spec first. Run `npm run sentry:autofix -- next --dry-run` and process at most one issue. If its disposition is not `candidate`, report it and stop. Fetch origin and inspect every worktree, branch, remote PR, and ownership conflict. Never modify an active checkout. Create a fresh isolated worktree from exact origin/main. Reproduce the issue with a failing test before editing. Never auto-change auth, roles, permissions, access management, RLS, migrations, database types, financial workflows, leases, tenant/property/unit/people/document workflows, secrets, environment, integrations, dependency-major versions, destructive behavior, or ambiguous failures. Run the relevant tier, lint, `npx tsc --noEmit`, `npm run test:all`, and `npm run build`. Fetch origin/main again and stop if it changed. Commit with the Sentry short ID, push a new non-force feature branch, and open a pull request with the verification evidence. Never merge, push to `main`, deploy production, resolve the Sentry issue, or delete another task's branch/worktree. Leave production verification and issue resolution to the reviewed release workflow. Remove only the automation-owned clean worktree after its branch is safely pushed. Never force-push, bypass a gate, or expose tokens or raw Sentry payloads.
```

Set notifications for failed runs and authorization-required stops. The schedule is hourly in `Asia/Bangkok`, local execution, attached to the Nestory project.

- [ ] **Step 4: Execute a dry run before enabling live fixes**

Run the automation once with no unresolved synthetic issue and require a safe no-candidate report. Then use the controlled verification error to create one Sentry issue, rerun in dry-run mode, and verify the output contains safe metadata but no user email, request content, cookie, query string, financial value, or secret.

- [ ] **Step 5: Verify a real Sentry event and source map**

Deploy the instrumented branch through the reviewed pull-request path. Trigger the controlled authenticated error once. In Sentry, confirm environment `production`, exact Git SHA release, resolved source filename/line, normalized route, pseudonymous user ID, organization/role tags, and absence of prohibited data. Remove or disable the trigger and redeploy.

- [ ] **Step 6: Activate hourly execution and record exact state**

Enable the automation only after the dry run and redaction inspection pass. Record its automation ID, status, next run time, local execution constraint, final local SHA, remote `main` SHA, Vercel production deployment ID, and Sentry verification issue ID without recording tokens.

- [ ] **Step 7: Final repository and external verification**

Run:

```powershell
git fetch origin --prune
git status --short --branch
git rev-parse HEAD
git rev-parse origin/main
vercel inspect --logs $(vercel ls nestory --yes | Select-Object -First 1)
```

Expected: local and remote SHAs match the intended release, the worktree is clean, production is healthy, Sentry received the redacted event, and the automation is active. If external authorization blocks any proof, report the exact missing action and do not claim the system is ready.
