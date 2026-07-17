# Verification

Use the smallest check that proves the change, then expand when the blast radius
is larger.

For authenticated UI flow work, also apply
`docs/frontend-quality-checklist.md`.

## Standard Checks

```bash
npm run lint
npx tsc --noEmit
npm run test
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

Accounting changes must also prove that journals remain balanced, source
posting is idempotent, locked periods reject new postings, reversals preserve
the original journal, and active operational ledger rows retain journal links.
The pgTAP files under `supabase/tests/accounting_*.sql` provide these checks.

## Browser Checks

Use a real browser smoke when a change affects:

- Auth redirects, setup, workspace/no-access flows, or subdomain routing.
- Operational page layout or responsive behavior.
- Create/edit/archive/restore drawers.
- File upload or import flows.
- Maintenance board/agenda/checklist/task interactions.
- Report export or print/PDF behavior.

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

## Route Checks

- A public unauthenticated request to protected dashboard routes should redirect
  to login/setup/no-access as appropriate.
- Admin-only pages should reject non-admin users.
- Manager/member task access should remain role-limited.
- Links from reports, recent changes, property/unit detail, and maintenance
  drawers should preserve focused IDs through URL params.
- `npm run test:ui-coverage` must report the filesystem and all 47 current page
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
