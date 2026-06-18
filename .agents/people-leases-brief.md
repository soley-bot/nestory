# People And Leases Implementation Brief

## Global Context

- Repo: `D:\nestory`
- Branch: `codex/people-leases`
- Product direction: quiet operational PMS for Cambodia property managers.
- Design source of truth: `PROJECT_RULES.md` and `docs/operational-ui-handoff.md`.
- Next.js rule: read `AGENTS.md` and the relevant files under `node_modules/next/dist/docs/` before writing app code.
- Existing list pattern: Properties and Units pages use a compact header, 32px-ish filters, dense selector table/card surface, pagination, and a docked inspector on wide desktop.
- Existing data boundary: App Router pages call `requireAdminContext()`, parse promised `searchParams`, load server data, and pass it to client screen components. Writes use `"use server"` actions calling Supabase RPCs, then `revalidatePath`.

## Product Scope

Build the next backbone module:

1. People: one operational people/company directory covering tenants, owners, and vendors.
2. Leases: lease records connected to tenants/parties, properties, units, terms, occupancy, deposits, documents, timeline, and activity.

Do not build tenant portal, payments, owner statements, vendor payments, complex permissions, or full maintenance workflows in this pass.

## Database Contract

Keep `public.leases` as the parent lease table for compatibility.

Add normalized identity/role tables around it:

- `public.people`
  - Durable person/company record.
  - Columns: `id`, `organization_id`, `display_name`, `legal_name`, `party_type`, `primary_email`, `primary_phone`, `tax_identifier`, `notes`, audit columns, archive columns.
  - `party_type` text check: `individual`, `company`.
- `public.person_roles`
  - Role assignment for a person/company.
  - Columns: `id`, `organization_id`, `person_id`, `role`, `status`, audit columns, archive columns.
  - `role` text check: `tenant`, `owner`, `vendor`.
  - `status` text check: `active`, `inactive`.
  - Unique active role per person/role.
- `public.person_contacts`
  - Contact methods/secondary contacts under a person/company.
  - Columns: `id`, `organization_id`, `person_id`, `contact_name`, `contact_type`, `email`, `phone`, `is_primary`, `notes`, audit columns, archive columns.
- `public.property_owners`
  - Joins owner people to properties.
  - Columns: `id`, `organization_id`, `property_id`, `person_id`, `ownership_label`, `ownership_percent`, `is_primary`, `started_on`, `ended_on`, audit columns, archive columns.
- `public.vendor_profiles`
  - Vendor-specific profile data.
  - Columns: `id`, `organization_id`, `person_id`, `service_category`, `service_area`, `preferred`, `status`, audit columns, archive columns.
- `public.lease_parties`
  - Joins leases to people and party roles.
  - Columns: `id`, `organization_id`, `lease_id`, `person_id`, `party_role`, `is_primary`, `started_on`, `ended_on`, audit columns, archive columns.
  - `party_role` check: `primary_tenant`, `co_tenant`, `guarantor`, `billing_contact`, `authorized_occupant`.
- `public.lease_terms`
  - Lease renewal/version terms.
  - Columns: `id`, `organization_id`, `lease_id`, `term_sequence`, `start_date`, `end_date`, `rent_amount`, `rent_currency`, `rent_due_day`, `payment_frequency`, `status`, `notice_date`, audit columns, archive columns.
- `public.lease_occupancies`
  - Unit occupancy/move history.
  - Columns: `id`, `organization_id`, `lease_id`, `property_id`, `unit_id`, `status`, `scheduled_move_in_date`, `actual_move_in_date`, `notice_date`, `scheduled_move_out_date`, `actual_move_out_date`, audit columns, archive columns.
- `public.lease_deposits`
  - Security/deposit lifecycle.
  - Columns: `id`, `organization_id`, `lease_id`, `deposit_type`, `amount`, `currency`, `status`, `received_on`, `returned_on`, `notes`, audit columns, archive columns.

Schema rules:

- Every new public business table must enable RLS.
- Use admin-only policies with `app_private.is_org_admin(organization_id)`.
- Include explicit `GRANT SELECT, INSERT, UPDATE` to `authenticated` and `service_role`; do not grant `anon`.
- Use archive over delete.
- Add FK indexes and screen-shaped indexes.
- Add check constraints for statuses and non-negative money/percent.
- Add org-consistency checks in write RPCs, and direct FKs where available.
- Keep `leases.tenant_name` temporarily for current Units/Timeline compatibility.
- Add nullable `leases.primary_tenant_person_id` if useful, but existing readers must keep working.
- Backfill one `people` row, one `tenant` role, and one `lease_parties` primary tenant row from existing `leases.tenant_name`.
- Prefer SQL functions/RPCs for create/update/archive/restore actions that write activity logs.

## UI Contract

People page:

- Route: `/people`
- Also make existing `/tenants` route show the People experience filtered to tenants or redirect to `/people?role=tenant`.
- Header title: `People`
- Add button: `Add person`
- Table columns should be compact: Person, Roles, Contact, Linked records, Status, Actions.
- Filters: query, role (`all`, `tenant`, `owner`, `vendor`), status/archive state, sort, page size.
- Inspector: roles, primary contact, related active lease/property/vendor summary, notes, compact actions.

Leases page:

- Route: `/leases`
- Header title: `Leases`
- Add button: `Add lease`
- Table columns should be compact: Lease, Tenant, Unit, Term, Rent, Deposit, Status, Actions.
- Filters: query, property, status, archive state, sort, page size.
- Inspector: tenant parties, unit/property, term dates, rent/deposit, occupancy status, linked actions.

Design constraints:

- Stay white, neutral, operational, dense.
- No marketing layout, no decorative hero, no gradients/orbs, no nested cards.
- Text must wrap/truncate deliberately and avoid page-level horizontal overflow.
- Use lucide icons for icon actions and familiar compact controls.
- Reuse `Button`, `Input`, `SelectControl`, `SideDrawer`, `Badge`, `PaginationControls`, and existing money display utilities.

## Verification

At minimum run:

- `npm run lint`
- `npm run test`
- `npm run build`

If schema changes are active locally and Docker is running:

- `npm run db:lint`
- `npm run db:reset`
- `npm run db:types`

Do not claim hosted deployment unless it is actually performed and verified.
