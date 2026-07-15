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
runner uses the supplied test account for authentication, then blocks every
non-read browser request while it visits the representative routes. Generated
screenshots and `summary.json` remain under the ignored
`artifacts/ui-redesign/<UTC run>/` directory.

```powershell
$env:BASE_URL='http://localhost:3000'
$env:E2E_EMAIL='local fixture email'
$env:E2E_PASSWORD='local fixture password'
npm run test:ui-redesign
```

For authenticated UI, start from the route an operator would use, not only a
deep component state.

## Route Checks

- A public unauthenticated request to protected dashboard routes should redirect
  to login/setup/no-access as appropriate.
- Admin-only pages should reject non-admin users.
- Manager/member task access should remain role-limited.
- Links from reports, recent changes, property/unit detail, and maintenance
  drawers should preserve focused IDs through URL params.

## Handoff Expectations

When finishing work, state:

- Files changed.
- What user-visible behavior changed.
- Checks run and their result.
- Checks not run, with the reason.
- Any known placeholder or limitation that remains.

For commit/push/deploy work, also include branch, commit, remote parity, and
deployment state.
