# Supabase Migration History Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile the 20 hosted/Git migration identities without changing hosted history or SQL bodies, then make hosted production migration release a serialized, fail-closed main-SHA workflow.

**Architecture:** A one-time manifest authorizes byte-identical filename changes and is consumed by migration discipline. A pure Node parity core evaluates Supabase migration-list JSON for prefix/equality rules, while GitHub Actions owns the only production `db push` path and reports the hosted result to Vercel.

**Tech Stack:** Node.js 24, Node test runner, Supabase CLI 2.109.x from the lockfile, GitHub Actions, PostgreSQL/Supabase, Vercel deployment checks.

**Spec:** `docs/superpowers/specs/2026-08-21-supabase-migration-history-reconciliation-design.md`

## Global Constraints

- Preserve production data; never reset or seed the hosted project.
- Do not run `migration repair` or mutate `supabase_migrations.schema_migrations`.
- Do not edit any historical migration SQL body.
- Production schema writes come only from the exact merged `main` SHA through `supabase db push`.
- Connector `apply_migration` is forbidden against production.
- Keep the existing Application and Database PR checks and branch protection intact.
- Never print Supabase or Vercel credentials.
- Do not touch any other registered worktree or parked branch.

---

### Task 1: Authorize only the proven byte-identical migration renames

**Files:**
- Create: `supabase/migration-reconciliations/20260821-hosted-ledger.json`
- Modify: `scripts/migration-discipline-core.node-test.mjs`
- Modify: `scripts/migration-discipline-core.mjs`
- Modify: `scripts/verify-migration-discipline.mjs`

**Interfaces:**
- Consumes: manifest entries `{ from, to, name, gitSha256, sqlSha256 }`.
- Produces: `evaluateMigrationChanges({ baseFiles, currentFiles, reconciliations })`, where a declared rename passes only when source bytes, destination bytes, suffix/name, and both hashes agree.

- [ ] **Step 1: Write the failing approved-rename tests**

Add tests that hand-derive these outcomes:

```js
assert.deepEqual(
  evaluateMigrationChanges({
    baseFiles: new Map([[oldPath, "select 1;\n"]]),
    currentFiles: new Map([[newPath, "select 1;\n"]]),
    reconciliations: [{
      from: oldPath,
      to: newPath,
      name: "example",
      gitSha256: "c3b432f86e...",
      sqlSha256: "354b7196c9...",
    }],
  }),
  [],
);
```

Also assert that undeclared renames, changed destination bytes, wrong names, and wrong hashes fail.

- [ ] **Step 2: Run the focused test and observe RED**

Run: `node --test scripts/migration-discipline-core.node-test.mjs`

Expected: the approved-rename test fails because the evaluator currently reports a deletion and a backdated migration.

- [ ] **Step 3: Implement minimal manifest validation**

Use Node `crypto.createHash("sha256")` over exact UTF-8 content and over `content.replace(/[\r\n]+$/u, "")`. Treat a reconciliation as approved only when:

```js
baseFiles.get(entry.from) === currentFiles.get(entry.to)
entry.from.endsWith(`_${entry.name}.sql`)
entry.to.endsWith(`_${entry.name}.sql`)
sha256(currentFiles.get(entry.to)) === entry.gitSha256
sha256(trimTrailingNewlines(currentFiles.get(entry.to))) === entry.sqlSha256
```

Load and flatten every JSON manifest under `supabase/migration-reconciliations` in `verify-migration-discipline.mjs`.

- [ ] **Step 4: Re-run focused tests and migration discipline**

Run:

```powershell
node --test scripts/migration-discipline-core.node-test.mjs
npm run db:verify-migrations
```

Expected: both exit 0 before any migration filename changes.

### Task 2: Rename the 20 migration files without changing SQL bytes

**Files:**
- Rename only: the 20 paths listed in `supabase/migration-reconciliations/20260821-hosted-ledger.json`
- Test: `scripts/migration-discipline-core.node-test.mjs`

**Interfaces:**
- Consumes: the checked-in reconciliation manifest and exact existing file bytes.
- Produces: a Git migration version set identical to the hosted ledger.

- [ ] **Step 1: Record exact and normalized hashes in the manifest**

Populate all 20 verified pairs. `gitSha256` is the current LF file hash; `sqlSha256` is the SHA-256 after removing trailing CR/LF characters only.

- [ ] **Step 2: Rename with patch moves only**

Use `apply_patch` move directives. Do not include SQL hunks and do not run a formatter.

- [ ] **Step 3: Verify byte identity and discipline**

Run:

```powershell
git diff --summary -- supabase/migrations
git diff --numstat -- supabase/migrations
$env:MIGRATION_BASE_REF='origin/main'; npm run db:verify-migrations
```

Expected: Git reports 20 renames, no added/deleted SQL lines, and discipline exits 0.

- [ ] **Step 4: Replay the reordered history**

Run:

```powershell
npm run supabase:start
npm run db:reset
npm run db:lint
npm run db:types
git diff --exit-code -- src/types/database.generated.ts
npx supabase test db --local supabase/tests
npm run leases:test-term-authority
npm run leases:test-history-integrity
npm run leases:test-relationships
```

Expected: the full chain applies from empty state, generated types do not change, pgTAP passes, and the lease concurrency/invariant harnesses pass.

### Task 3: Add fail-closed hosted migration parity checks

**Files:**
- Create: `scripts/hosted-migration-parity-core.mjs`
- Create: `scripts/hosted-migration-parity-core.node-test.mjs`
- Create: `scripts/verify-hosted-migration-parity.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `evaluateHostedMigrationParity({ localVersions, remoteVersions, phase })` returning `{ issues, pendingVersions, localCount, remoteCount }`.
- Produces package commands: `db:hosted-preflight` and `db:hosted-postflight`.

- [ ] **Step 1: Write failing parity tests**

Use literal fixtures to assert:

```js
evaluateHostedMigrationParity({
  localVersions: ["20260801000000", "20260802000000"],
  remoteVersions: ["20260801000000"],
  phase: "preflight",
})
```

passes with one pending suffix, while an unknown remote version, a remote history hole/non-prefix, a malformed version, or any postflight pending version fails.

- [ ] **Step 2: Run the focused test and observe RED**

Run: `node --test scripts/hosted-migration-parity-core.node-test.mjs`

Expected: module-not-found failure before implementation.

- [ ] **Step 3: Implement the pure evaluator and CLI wrapper**

The wrapper reads local filenames, invokes the lockfile Supabase CLI as:

```js
spawnSync(process.execPath, [
  "node_modules/supabase/dist/supabase.js",
  "--output-format", "json",
  "migration", "list", "--linked",
])
```

It parses only `migrations[].local` and `migrations[].remote`, prints counts and pending versions, and never prints environment values.

- [ ] **Step 4: Run RED to GREEN and reproduce current parity**

Run:

```powershell
node --test scripts/hosted-migration-parity-core.node-test.mjs
npm run db:hosted-postflight
npx supabase db push --linked --dry-run
```

Expected after file renames: tests pass, postflight reports exact equality, and dry run reports the remote database is up to date.

### Task 4: Make hosted release the Vercel Database gate

**Files:**
- Modify: `scripts/ci-deployment-gate.node-test.mjs`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: protected environment secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_ID`.
- Produces: serialized `production_database` and `production_database_gate` jobs on pushes to `main`.

- [ ] **Step 1: Change the workflow contract test first**

Assert that `production_database`:

- needs `database`;
- runs only for a push to `refs/heads/main`;
- uses environment `production-database`;
- uses concurrency group `production-supabase` with `cancel-in-progress: false`;
- verifies `HEAD`, `GITHUB_SHA`, and `origin/main` are identical;
- links Supabase only after secret-presence checks;
- runs preflight, dry run, `db push`, postflight, linked lint, and final dry run in order.

Assert that `production_database_gate` reports `Vercel - nestory: Database` from `needs.production_database.result`, with a hosted-release description.

- [ ] **Step 2: Run the contract and observe RED**

Run: `node --test scripts/ci-deployment-gate.node-test.mjs`

Expected: failure because the current database status depends on local `database` only.

- [ ] **Step 3: Implement the workflow minimally**

Keep the local `database` job unchanged. Add the hosted job and move only the Database status reporter to the hosted result. Use `npm ci` and the lockfile CLI; do not install `latest` tooling.

- [ ] **Step 4: Run workflow contracts and all contract tests**

Run:

```powershell
node --test scripts/ci-deployment-gate.node-test.mjs scripts/hosted-migration-parity-core.node-test.mjs scripts/migration-discipline-core.node-test.mjs
npm run test:contracts
```

Expected: all exit 0.

### Task 5: Document the operator and recovery boundary

**Files:**
- Create: `AGENTS.md`
- Create: `docs/runbooks/production-database-release.md`
- Modify: `docs/database/migration-policy.md`
- Modify: `PROJECT.md`

**Interfaces:**
- Produces: durable production DDL prohibition, exact operator sequence, credential ownership, failure modes, and approval boundary for any future history mutation.

- [ ] **Step 1: Add the agent prohibition**

State that production connector `apply_migration`, hosted reset/seed, local direct production pushes, and edits/renames of shared migrations are forbidden. The 2026-08-21 manifest is the single named exception for proven identity reconciliation.

- [ ] **Step 2: Add the release runbook**

Document environment creation, three secret names, normal merged-main flow, GitHub/Vercel observation, hosted pre/postflight interpretation, no-op releases, unknown-remote response, failed-migration forward repair, backup/PITR expectations, and explicit approval required before any `migration repair`.

- [ ] **Step 3: Update the migration and project contracts**

Make CI the only production database writer and explain that `Vercel - nestory: Database` now means hosted push/postflight, not local reset.

- [ ] **Step 4: Scan documentation for forbidden ambiguity**

Run:

```powershell
rg -n "apply_migration|migration repair|production-database|Vercel - nestory: Database|db reset --linked|include-seed" AGENTS.md PROJECT.md docs/database/migration-policy.md docs/runbooks/production-database-release.md
```

Expected: every production mutation is explicitly prohibited or routed through the protected workflow.

### Task 6: Verify, publish, and release through protected gates

**Files:**
- No additional product files expected.

**Interfaces:**
- Produces: focused PR, merged SHA, hosted ledger parity, production deployment parity, runtime smoke, and an honest pilot-readiness verdict.

- [ ] **Step 1: Run full local verification**

Run migration discipline, reset, lint, generated types, pgTAP, lease concurrency/invariants, application lint, TypeScript, unit/UI/contract tests, and build. Every command must exit 0 on the exact tree to be committed.

- [ ] **Step 2: Commit only scoped paths and open a non-draft PR**

Stage explicit files only, push `codex/supabase-migration-history-reconciliation`, and create a PR against `main` with the reconciliation evidence and protected-release checklist.

- [ ] **Step 3: Configure the protected environment without exposing values**

Create `production-database`, restrict it to the protected `main` branch, and confirm the three required secret names exist. If values are unavailable, stop before merge and report the credential gate.

- [ ] **Step 4: Satisfy checks and merge normally**

Wait for Application and Database PR checks, resolve every review conversation, rebase/merge normally as policy permits, and never force-push or force-merge.

- [ ] **Step 5: Verify hosted and production state from the merged SHA**

Confirm the main push workflow's hosted job and both Vercel statuses, `migration list` with zero unexplained versions, linked error lint, final dry run up to date, direct schema/data invariants, Vercel deployment ID and exact SHA/aliases, `/` and `/login` 200, `/overview` login redirect, and no recent production errors.

- [ ] **Step 6: Report final provenance**

Report branch/PR/merge SHA, every changed file, local and hosted verification, production deployment/SHA, all worktree states, any blocked credential/approval, and withhold pilot readiness unless every gate is aligned.
