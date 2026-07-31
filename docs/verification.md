# Verification

Use the smallest check that proves the change, then expand when the blast radius
is larger.

For authenticated UI flow work, also apply
`docs/frontend-quality-checklist.md`.

## Standard Checks

```bash
npm run lint
npx tsc --noEmit
npm run test:all
npm run build
npm run test:ui-coverage
npm run test:ui-copy
```

Focused variants are fine for narrow work:

```bash
npm run lint -- "src/features/<feature>/file.tsx"
npm run test -- src/features/<feature>/<file>.test.ts
```

## Supabase Checks

```bash
npm run supabase:start
npm run db:lint
npm run db:reset
npm run db:types
npx supabase test db --local supabase/tests
npm run supabase:stop
```

Use Supabase checks when migrations, generated database types, RLS, RPCs,
storage, seed data, or local database behavior changed.

For the deterministic demo fixture:

```powershell
npm run db:reset:demo
npm run db:reset:demo -- --reference-date 2030-01-15
npm run demo:seed:manifest
npm run test:demo-tools
```

The seed refuses databases that do not expose the standard local Supabase JWT
secret. The explicit-date wrapper discovers only a running local Supabase
database container. Hosted refresh preparation is planning-only; see
`docs/verification/hosted-demo-cutover-runbook.md`.

## Invitation Credential Verification

PR #24 is integrated into the report-consolidation branch through `main`. A
local invitation replay passed invitation acceptance, required password
creation, logout, password login, and the Member workspace destination. This is
local fixture evidence, not production invitation verification.

Cross-domain verification must also distinguish implemented behavior from
unsupported workflow assumptions:

- Maintenance currently supports actual-cost capture and Admin direct ledger
  linkage, not a prefilled bill or petty-cash handoff with reciprocal links,
  duplicate prevention, or void recovery.
- Petty cash currently derives rollover from the calculated close; it does not
  capture a separate physical cash count or resolve a counted-versus-calculated
  variance.

Accounting changes must also prove that journals remain balanced, source
posting is idempotent, locked periods reject new postings, reversals preserve
the original journal, and active operational ledger rows retain journal links.
The pgTAP files under `supabase/tests/accounting_*.sql` provide these checks.

## Browser Checks

Use a real browser smoke when a change affects:

- Auth redirects, invitation acceptance, recovery, workspace/no-access flows,
  or subdomain routing.
- Operational page layout or responsive behavior.
- Create/edit/archive/restore drawers.
- File upload or import flows.
- Maintenance board/agenda/checklist/task interactions.
- Report PDF/Excel export behavior.

### Read-only redesign baseline

Run the redesign evidence capture only against an explicit local fixture. The
runner accepts only HTTP(S) loopback hosts (`localhost`, `127.0.0.1`, or
`::1`) without URL userinfo. It uses the supplied test account for one
Next.js login server action, then blocks every non-read browser request while
it visits the representative routes. Generated screenshots and `summary.json`
remain under the ignored `artifacts/ui-redesign/<UTC run>/` directory.

```powershell
$env:BASE_URL='http://localhost:3000'
$env:E2E_EMAIL='local fixture email'
$env:E2E_PASSWORD='local fixture password'
npm run test:ui-redesign
```

The manifest-backed runner covers every page in
`config/ui-route-coverage.json` at 1440x900, 1024x768, and 390x844. It also
checks manager, member, and anonymous access outcomes, exact legacy redirect
destinations, and query preservation. `npm run test:ui-a11y` adds serious and
critical axe checks. Both commands fail on application errors, document-level
overflow, unreachable actions, blocked mutations, or route/query mismatches.

Use `--route=<manifest-route>` for a focused diagnostic run. This option cannot
write the full evidence document. A successful full run may write evidence with:

```powershell
$env:BASE_URL='http://127.0.0.1:3000'
$env:E2E_EMAIL='local admin fixture email'
$env:E2E_PASSWORD='local fixture password'
npm run test:ui-a11y -- --write-evidence
```

The generated document lives at
`docs/verification/ui-redesign-evidence.md`; screenshots and JSON summaries stay
under ignored `artifacts/ui-redesign/` paths.

### Full local UI gate

Build and start the production app with the confirmed local Supabase variables,
then run:

```powershell
$env:BASE_URL='http://127.0.0.1:3000'
$env:E2E_EMAIL='local admin fixture email'
$env:E2E_PASSWORD='local fixture password'
npm run test:ui-redesign
npm run test:ui-a11y

$env:NESTORY_BASE_URL='http://127.0.0.1:3000'
$env:NESTORY_TEST_EMAIL='local admin fixture email'
$env:NESTORY_TEST_PASSWORD='local fixture password'
npm run test:properties-flow
npm run test:maintenance-mobile
```

The retained role fixtures are `manager@nestory.com` and
`member@nestory.com`, using `E2E_ROLE_PASSWORD` when set or the admin fixture
password otherwise. These are disposable local accounts, not hosted credentials.

For authenticated UI, start from the route an operator would use, not only a
deep component state.

### Invitation credential lifecycle

Invitation changes are not verified by reaching the workspace once. Use local
Supabase and the newest Mailpit message to prove the complete credential
lifecycle:

1. For a brand-new invited identity, inspect the generated email target, pass
   through `/auth/complete`, confirm `/auth/session` succeeds, and confirm
   `/accept-invite` requires password creation.
2. Accept the invitation, follow the role-specific `/workspace` continuation,
   sign out, and sign in with the selected password.
3. For an existing identity with positive proof from a successful password
   login, verify a fresh magic-link invitation omits password creation and the
   existing password still works after sign-out.
4. For an existing confirmed identity with a non-empty password hash but no
   private proof, verify a fresh magic-link invitation requires password
   creation, cannot be submitted empty, and the replacement password works
   after sign-out.
5. Run the invitation pgTAP coverage for Admin, Manager, and Member, missing or
   matching challenges, empty hashes, direct RPC bypass, and private-table
   privileges.

Do not inspect or print Auth password hashes during browser verification.
Database evidence should be limited to invitation status, membership role,
proof method/timestamp presence, and whether the private challenge remains.

## Route Checks

- A public unauthenticated request to protected dashboard routes should redirect
  to login. Authenticated accounts without membership should reach no-access.
- Admin-only pages should reject non-admin users.
- Manager/member task access should remain role-limited.
- Links from the three reports and property/unit detail should preserve focused
  IDs through URL params.
- `npm run test:ui-coverage` must report the filesystem and all 54 current page
  routes in agreement, with exactly one evidence row per manifest entry.

## Handoff Expectations

When finishing work, state:

- Files changed.
- What user-visible behavior changed.
- Checks run and their result.
- Checks not run, with the reason.
- Any known placeholder or limitation that remains.

For commit/push/deploy work, also include branch, commit, remote parity, and
deployment state.
