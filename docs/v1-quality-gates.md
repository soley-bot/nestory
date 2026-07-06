# Nestory v1.0 Quality Gates

This file defines v1.0 by trust and readiness, not by adding every possible
property-management feature.

## v1.0 Definition

Nestory v1.0 means a first customer can create a workspace, bring in core
records, use daily operating workflows, and trust that the data is safe,
permissioned, audited, backed up, and presented as a real product.

## Gates

### Branding Gate

- Real Nestory logo is used in public, auth, and app shell surfaces.
- Browser favicon/app icon use Nestory assets, not framework defaults.
- Landing page supports light and dark mode while preserving the current public
  design direction.
- Public, auth, and authenticated surfaces feel like the same product.

### Workflow Gate

- Daily workflow pages remain reachable: overview, properties, units, people,
  leases, ledger, maintenance, documents, import, reports, settings/users.
- Placeholder routes may remain for v1.0, but copy must be professional and
  clear that the workflow is planned.
- Placeholder routes must not be documented as finished modules.

### Onboarding Gate

- A blank workspace should explain the first useful actions.
- Setup should guide users toward property records, unit/rent-roll import,
  people, leases, and ledger opening data.
- A blank demo account should feel intentional, not broken.

### Import Gate

- Imports should support properties, units/rent roll, people, and leases.
- Templates, column matching, validation, cleanup, staged runs, and safe commits
  must remain clear.
- Real customer spreadsheet samples are deferred until available; synthetic
  fixtures are not enough to certify the 95% target.

### Permission Gate

- v1.0 roles remain `admin`, `manager`, and `member`.
- Protected routes and mutations must respect organization scope and role.
- Admin-only surfaces must reject non-admin users.

### Audit Gate

- Important business writes should leave activity or history evidence.
- Money, lease, document, maintenance, property/unit, and import commit writes
  are priority audit paths.

### Data Safety Gate

- Archive/restore remains the default lifecycle pattern.
- Failed imports and document uploads must not corrupt committed records.
- Hard deletes should stay rare and intentional.

### Production Gate

- Latest `main` deployment should be verified on Vercel before v1.0 signoff.
- Linked Supabase migrations must match local migration history.
- Logs must be accessible.
- Backup and restore procedure is required before v1.0 signoff. A full restore
  drill may depend on the selected Supabase plan.

## Deferred Inputs

- Real import spreadsheets from target customers.
- Final backup/restore standard after Supabase plan decision.
