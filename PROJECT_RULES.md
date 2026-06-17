# Nestory Project Rules

Nestory starts as a web-first Property History and Performance Hub for property management companies in Cambodia, with a phased path toward a broader property management system.

The product goal is simple:

> Show the complete history and performance of a property or unit in one place.

These rules should guide architecture, UI, database design, feature scope, and refactoring decisions.

## Product Direction

- Build as a web app first.
- Optimize for desktop property management work.
- Use the Timeline-First Record Room direction as the product north star.
- Keep the UI simple, quiet, and operational.
- Prefer dense tables, useful filters, clear icons, and readable records.
- Avoid decorative visuals, loud dashboards, gradients, oversized cards, and marketing-style layouts.
- Use neutral colors and minimal accents.
- Less is more.

Use `docs/operational-ui-handoff.md` when applying the current authenticated app design system to additional pages. It captures the Properties and Units list/table/card/inspector pattern, including the photo-ready card rule that readable text must not sit on top of real property or unit photos.

## Long-Term Product Direction

- Broad PMS capability is allowed as the larger ambition, but Nestory should grow from the record-room foundation instead of copying every competitor module at once.
- Leases & Tenants is the next backbone module after the Timeline/Ledger foundation.
- Leases & Tenants should connect occupants, lease terms, move-in and move-out history, rent obligations, documents, and unit status back to the property and unit record.
- Later PMS phases can include Tasks/Maintenance, deeper Accounting/Reports, Tenant Portal, Payments, Communications, and Workflows.
- Keep Phase 1 constraints intact until explicitly changed: one Admin role, simple UI, archive-over-delete, activity logging, USD/KHR support, reusable components, and minimal operational screens.
- Future module database design should follow `docs/enterprise-lite-database-roadmap.md` before new PMS migrations are added.

## Timeline And Ledger UX Rules

- Timeline and Ledger are primary working surfaces, not dashboards or landing pages.
- Keep the main record table visible as early as possible in the first viewport.
- Size operational table columns by expected content length and scan value. Dates, type badges, amounts, status, and actions should stay compact; record/category/description context should get the flexible width.
- Use side drawers for create, edit, archive, restore, attachment, period-lock, and activity-detail workflows.
- Do not push the table down with expanded secondary panels.
- Recent changes is useful audit context, but it is secondary to the records. On Timeline and Ledger it should stay collapsed by default; use the activity detail drawer when someone needs to inspect a specific change.
- For larger audit history, add a dedicated Activity page or drawer with filtering and pagination instead of paginating inside the compact Recent changes panel.
- Activity detail should show field-level before and after values, and must remain readable on mobile by stacking values when needed.
- Activity detail should not show raw UUIDs for normal operators. Hide pure system fields and summarize reference changes in user language.
- Linked Timeline/Ledger behavior should be explicit in the inspector. Ledger-owned timeline events should be edited, archived, and restored from Ledger.
- Archive views should be available through filters, and archived records should be clearly labeled without affecting normal active totals.
- Accounting period locks should be visible in Ledger and enforced by the database, not only by disabled UI controls.

## Responsive UI Rules

- Design mobile-first even though desktop is the primary operating context.
- Filters should stack on small screens and become dense horizontal controls on desktop.
- Drawer forms should collapse to one column on narrow screens.
- Button groups should wrap or stack instead of shrinking text.
- Long titles, descriptions, file names, and linked-record labels must wrap or truncate deliberately; text should not overflow its container.
- Tables may use horizontal scrolling for dense operational data, but surrounding cards, drawers, headers, and filters should not force page-level horizontal overflow.
- Fixed drawers must stay visually pinned when Radix dropdowns lock body scroll; account for `--removed-body-scroll-bar-size` on drawer overlays.
- Use stable spacing such as `px-4 sm:px-6 lg:px-8` for major page regions unless a local design reason requires something different.
- The desktop sidebar should not consume phone viewport width. Use a compact mobile app header/nav below the desktop breakpoint.
- Use shared Nestory/Radix controls for selects, dates, and accounting months instead of native browser popups when the control is part of a polished workflow.

## Recommended Stack

- Next.js App Router.
- TypeScript.
- Tailwind CSS.
- Supabase Postgres for the database.
- Supabase Auth with email/password.
- Supabase Storage for documents and photos.
- Vercel for hosting.

Current local CLI status:

- Node.js: `v24.8.0`
- npm: `11.6.0`
- Vercel CLI: `54.14.0`, logged in
- Supabase CLI: available through `npx supabase`, verified at `2.106.0`
- Docker CLI/Engine: `29.5.3`

Docker Desktop must be running before Supabase local commands such as `npm run supabase:start`, `npm run db:lint`, or `npm run db:reset`.

Local Supabase foundation verified on 2026-06-16:

- `npm run supabase:start` passed.
- `npm run db:lint` passed with no schema errors.
- `npm run db:reset` passed.
- `npx supabase db advisors --local --type all --level warn --fail-on error` passed with no issues.
- Seed smoke query confirmed 1 organization, 2 properties, 2 units, and 2 timeline events.

Hosted Supabase foundation verified on 2026-06-16:

- Organization: `SOLEY`
- Project: `nestory`
- Project ref: `pfvmztxktkwyewvxfgot`
- Region: `ap-southeast-1` / Singapore
- Public URL: `https://pfvmztxktkwyewvxfgot.supabase.co`
- Applied migrations: `initial_schema`, `add_foreign_key_indexes`, `grant_authenticated_data_api_access`, `bootstrap_admin_organization`, `fix_bootstrap_admin_organization`, `move_bootstrap_admin_organization_private`
- Hosted auth data check on 2026-06-16 found 2 confirmed users, 2 organizations, and 2 admin memberships. There were no pending confirmation users or orphaned memberships to clean up.
- Hosted security advisors currently return one auth hardening warning: leaked password protection is disabled. Enable it in Supabase Auth password settings when the project plan supports it.
- Hosted performance advisors only returned `unused_index` INFO notices on the new low-usage database; keep those indexes until real usage data says otherwise.
- Hosted database intentionally has no seed data.
- Public schema tables have explicit Data API grants for `authenticated` plus server-only `service_role`; no broad anonymous table grants.
- First-admin workspace bootstrap is exposed through `public.bootstrap_admin_organization(text)`, which delegates to `app_private.bootstrap_admin_organization(text)` so organization and self-admin membership are created in one database transaction without exposing a public `SECURITY DEFINER` function.
- Codex Supabase MCP is authenticated and can manage the hosted project.
- Supabase CLI hosted auth still needs a fresh personal access token if we later use `supabase link` or `supabase db push`; local CLI commands work without hosted auth.

Use `docs/foundation-checklist.md` before adding new product modules or after changing auth, routing, Supabase policies, Vercel config, or environment variables.

Use the Vercel CLI for deployment work, especially `vercel env pull`, `vercel deploy`, and `vercel logs`.

Do not install Supabase CLI globally with npm. Use `npx supabase ...` before the app is scaffolded, then install it as a local dev dependency after `package.json` exists:

```bash
npm install supabase --save-dev
```

## Phase 1 Scope

Phase 1 should stay intentionally small:

- App shell.
- Email/password sign up and login.
- Single admin user role.
- Sidebar navigation.
- Properties list and property detail.
- Timeline screen with filters.
- Seed or mock data.
- Basic database schema.

Do not build the full product in Phase 1.

## Roles And Permissions

Phase 1 only needs one role:

- `Admin`

The admin can create, read, update, archive, and restore records.

Do not build complex permission screens yet. Future roles can be added later, such as Property Manager, Viewer, Accountant, Maintenance, Owner, or Platform Admin, but they should remain documented future possibilities only.

The database may still include an `organizationId` from the beginning so the app can support multiple companies later without a major migration.

## Multi-Company Design

Start with multi-company-safe data modeling.

Most business records should include:

- `organizationId`
- `createdAt`
- `createdBy`
- `updatedAt`
- `updatedBy`

Where relevant, records should also include:

- `propertyId`
- `unitId`
- `archivedAt`
- `archivedBy`

Even if the first version only has one company and one admin, data should not be designed in a way that blocks future company separation.

## Delete And Archive Policy

Do not hard delete business history by default.

Use archive or status fields for:

- Properties.
- Units.
- Timeline events.
- Leases.
- Ledger entries.
- Documents.

Hard deletes should be rare and limited to development cleanup or admin-only maintenance tools added later.

Historical leases, timeline events, ledger records, and documents should remain visible unless archived.

## Activity Log

Users may edit old timeline events, but important changes must create an activity log entry.

The activity log should record:

- Who made the change.
- What record changed.
- What action happened.
- When it happened.
- The previous and new values when practical.

When a mutation changes a business record and creates an activity log entry, both should happen in the same database transaction where possible.

## Race Conditions And Data Safety

Be careful with race conditions from the start.

Use:

- Server-side mutations for writes.
- Database constraints for uniqueness and required relationships.
- Transactions for linked changes.
- Idempotent actions where practical.
- Optimistic UI only when failure can be handled safely.
- Clear loading and disabled states during writes.

Avoid:

- Duplicate submissions.
- Client-only validation as the only protection.
- Updating linked records in separate unsafe steps.
- Calculating critical totals only on the client.

## Money

Nestory should support:

- USD.
- KHR.

Do not store money as loose JavaScript floats.

Use safe database types such as integer minor units or decimal columns. Each money amount should include a currency code.

Exchange rates, tax, VAT, and owner payout calculations are not Phase 1 unless explicitly requested later.

## Dates And Time

Use clear date fields for different concepts:

- `eventDate`
- `leaseStartDate`
- `leaseEndDate`
- `transactionDate`
- `createdAt`
- `updatedAt`

Do not mix business dates with audit timestamps.

Cambodia operations should be treated consistently around local date expectations.

## Documents And Storage

Use Supabase Storage for uploaded documents and photos.

Store metadata in the database, including:

- Organization.
- Related property.
- Related unit.
- Related lease.
- Related timeline event.
- Category.
- File name.
- Storage path.
- MIME type.
- Size.
- Uploaded by.
- Uploaded at.

Do not store files directly in database rows.

## Reports And Export

Reports are important, but keep them simple first.

Eventually support:

- On-screen reports.
- PDF export.
- Excel or CSV export.

Phase 1 can start with on-screen summaries and export-ready structure, without needing polished exports immediately.

## Import

Property teams may need to import existing property, unit, lease, and ledger data from Excel.

Design with import in mind:

- Stable IDs.
- Clear required fields.
- Validation errors that are readable.
- Import preview before committing records.
- Activity log entries for imported data.

Do not build a full import system in Phase 1 unless requested.

## Folder Structure

Prefer feature ownership over large global folders.

Suggested structure:

```txt
app/
  (auth)/
  (dashboard)/
    properties/
    units/
    timeline/
    ledger/
    documents/
    reports/
    settings/
  api/

src/
  features/
    properties/
    units/
    timeline/
    leases/
    ledger/
    documents/
    reports/

  components/
    ui/
    layout/
    data/
    forms/

  lib/
    auth/
    db/
    dates/
    money/
    validation/

  server/
    actions/
    queries/

  types/
  constants/
  seed/
```

Feature-specific UI, schemas, queries, and utilities should stay inside the feature folder until they are truly reused elsewhere.

## Reusable Components

Reusable components should be boring and practical.

Good shared components:

- Button.
- Input.
- Select.
- Dialog.
- Drawer.
- Tabs.
- Badge.
- Tooltip.
- DataTable.
- FilterBar.
- SearchInput.
- DateRangeFilter.
- MoneyCell.
- StatusBadge.
- EmptyState.

Keep product-specific components inside the feature first:

- TimelineEventRow.
- TimelineInspector.
- TimelineEventForm.
- PropertyPerformanceSnapshot.
- LinkedRecordList.

Only move a component to a shared folder after real reuse appears.

## Refactoring Rules

Avoid large mixed-purpose files.

Soft file-size guidance:

- 150-250 lines is usually fine.
- 250-400 lines should be reviewed for splitting.
- 400+ lines should usually be refactored.

Split files when they mix too many responsibilities:

- UI rendering.
- Data fetching.
- Mutations.
- Validation.
- Formatting.
- Business rules.
- Constants.
- Types.

Do not create broad dumping-ground files like giant `utils.ts`, `types.ts`, or `constants.ts`.

## State Management

Do not introduce complex state management early.

Prefer:

- Server-first data fetching.
- URL search params for filters where useful.
- Local component state for small UI interactions.
- Simple form state.

Add heavier client state only when the product has a clear need.

## Testing

Phase 1 does not need heavy testing everywhere, but business logic should be tested as it appears.

Prioritize tests for:

- Timeline filtering.
- Permission assumptions.
- Occupancy calculations.
- Income and expense totals.
- Currency formatting.
- Lease expiry calculations.
- Archive behavior.

## Development Principle

Build one phase at a time.

Before adding a new feature, check whether existing files need to be split or clarified. Keep the codebase easy to understand for future Codex sessions and future human developers.
