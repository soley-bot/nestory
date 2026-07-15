# Nestory Platform UI and UX Redesign Design

**Status:** Approved for implementation planning by the user's request on 2026-07-15.

## Goal

Redesign every user-facing Nestory surface so the product is immediately understandable, visually coherent, accessible, and efficient for repeated property operations without changing the underlying domain behavior, authorization model, URLs, or RPC-backed write boundaries.

## Chosen Approach

Use a shared-foundation, vertical-migration program.

1. Establish tokens, layout contracts, interaction rules, content rules, and verification tooling.
2. Upgrade the global shell and add role-aware command search.
3. Migrate related route families in independently shippable phases.
4. Finish with public/auth, responsive, accessibility, and complete route verification.

This is preferred over a big-bang redesign because each phase can be reviewed, tested, merged, and rolled back independently. It is preferred over isolated page polish because shared primitives and route coverage checks prevent visual and interaction drift.

## Product Principles

### Instinctive operation

- Use conventional controls and placement before adding explanatory copy.
- Explain risk, consequence, permission, accounting meaning, inheritance, or workflow handoff; do not explain how to use an obvious button, row, tab, filter, or search field.
- Keep visible field labels when they help comprehension or accessibility. Placeholder-only forms are not acceptable.
- If a sentence is required to explain how a control works, improve the control before adding the sentence.
- Use progressive disclosure for uncommon or advanced options.
- Give unfamiliar icon-only controls a tooltip, accessible name, and visible focus state.

### Operational density

- Keep table-first workflows for record-heavy modules.
- Keep URL-backed filters, pagination, inspectors, drawers, linked records, and archive/restore behavior.
- Keep 13px table-body density and 11px table headers; use at least 14px for normal page, form, and inspector body copy.
- Keep primary records and the next operator action visible without document-level scrolling on desktop.

### Explain outcomes, not controls

- Show consequence previews for settings, permission changes, imports, report generation, finance posting, period locking, archive/restore, and maintenance completion review.
- Use explicit draft state with `Discard` and `Apply changes` when several fields collectively change one configuration.
- Use immediate server actions for simple, isolated create flows when the outcome is obvious and reversible.
- Success states name the next useful action; error and blocked states name the resolution.

### Distinct visual language

- Do not copy CodeRabbit's orange accent or developer-tool aesthetic.
- Use three surface levels: canvas, work surface, and raised/preview surface.
- Remove borders that do not communicate grouping, focus, or separation.
- Use a deep teal or architectural sage selection accent; reserve amber for attention and operational warning states.
- Keep semantic status colors separate from navigation and selection color.
- Keep radii compact and precise on tables and toolbars, with slightly softer drawers and preview panels.

## Experience Architecture

### Global shell

- Preserve role-aware navigation for admin, manager, and member workspaces.
- Add a `Ctrl+K` / `Cmd+K` command palette that searches navigation, records, and safe quick actions.
- Group search results by domain and include enough context to disambiguate duplicate names.
- Restrict results and actions to routes and records the current role can access.
- Preserve the collapsed-sidebar mode and mobile primary navigation.

### Workspace anatomy

Every authenticated module uses the same structural contract:

1. Compact page header: title, current scope, and primary action.
2. Optional local workspace navigation for multi-view modules.
3. Toolbar: search, filters, view mode, review queues, and bulk-safe actions.
4. Main work surface: table, board, calendar, report, or focused form.
5. Inspector or consequence panel when selected context matters.
6. Drawer for create/edit/archive/restore flows that should not replace the current list context.

### Operational lists

- Preserve single-click or keyboard selection and a docked inspector on wide desktop.
- Expose selection with `aria-selected` or the appropriate selected-state contract.
- Provide a direct keyboard-operable record link; do not rely on double-click instructions.
- Make one next action visually primary in the inspector. Group linked-record navigation separately from mutation actions.
- On mobile, replace the docked inspector with the existing preview drawer pattern.

### Settings

Use a three-zone workspace:

1. Local settings rail for Organization, Branches, Teams, Users and Roles, and Account-related sections.
2. Focused editor for one settings family at a time.
3. Consequence preview showing scope, affected records or users, and post-save state.

Multi-field edits use a sticky draft action bar. Simple `Add branch` and `Add team` operations open focused panels instead of permanently occupying the overview screen.

### Overview

The Overview default lens answers `What needs attention now?` before presenting analytical detail.

- Rank overdue maintenance, submitted work awaiting review, arrears, expiring leases, statement blockers, and missing records.
- Keep cash-basis property metrics and existing lenses.
- Replace the empty no-selection inspector with portfolio-level reasoning or recommended actions.
- Preserve URL-backed month, property, lens, and review state.

### Forms and drawers

- Use visible labels, concise supporting copy, and domain examples only where needed.
- Separate common fields from advanced options.
- Keep server-action validation, zod validation, RPC boundaries, activity logging, storage rollback, and route revalidation unchanged.
- Destructive actions show the record, consequence, and recovery path before confirmation.
- Finance, period locks, imports, permissions, and maintenance review display a consequence summary before commit.

## Platform Coverage

The redesign covers every current user-facing route family:

- Public/auth: `/`, `/login`, `/signup`, `/setup`, `/no-access`.
- Shell and overview: `/workspace`, `/overview`.
- Property: `/properties`, `/properties/[propertyId]`, `/units`, `/units/[unitId]`.
- People: `/people`, `/tenants`, `/owners`, `/vendors`, `/staff`, `/people/[personId]`, `/people-reports`.
- Finance and leases: `/leases`, `/rent-income`, `/bills-expenses`, `/ledger`, `/petty-cash`.
- Maintenance: `/maintenance`, `/tasks`, `/inspections`, `/recurring-tasks`, `/work-orders`.
- History and records: `/timeline`, `/property-timeline`, `/maintenance-timeline`, `/financial-timeline`, `/documents`, `/import`.
- Reports: `/reports`, `/reports/[reportKind]`.
- Administration: `/settings`, `/users-roles`, `/account`.
- Legacy redirects: `/property-dashboard`, `/finance-dashboard`, `/maintenance-dashboard`, `/payments`, `/invoices`, `/schedule`, `/team` retain behavior and receive no duplicate standalone UI.

## Accessibility Contract

- Meet WCAG 2.2 AA contrast targets for normal text, large text, focus indicators, and non-text controls.
- Use one visible focus style across all interactive primitives.
- Provide keyboard access for navigation, command search, list selection, inspector actions, drawers, tabs, boards, and calendars.
- Preserve logical focus when drawers open and return focus to the trigger when they close.
- Announce loading, success, error, blocked, selection, and search-result count changes.
- Support 200% zoom, 320px reflow, reduced motion, and touch targets of at least 44px where density permits; compact desktop controls must retain an equivalent accessible target.
- Do not claim full conformance until automated and manual keyboard/screen-reader checks pass.

## Responsive Contract

- Wide desktop: persistent shell, bounded workspace, internal scrolling, and docked inspector.
- Standard desktop/tablet: collapsible shell, reduced columns, and preview drawer instead of a docked inspector when space is insufficient.
- Mobile: horizontal primary navigation, stacked filters, card/list rows, bottom or side preview drawer, and no hidden primary actions.
- All responsive states preserve the same route, filter, selection, and mutation behavior.

## Data and Security Boundaries

- Keep server-loaded App Router pages and current feature-owned data loaders.
- Keep organization scoping, RLS, role restrictions, and auth redirects.
- Global search executes on the server with the signed-in workspace context and limits results by role.
- Do not expose mutable organization-wide option collections or signed document URLs to member payloads.
- Keep all important writes in existing server actions and checked RPCs.
- Add only append-only search indexes if query plans prove that existing indexes are insufficient.

## Verification Strategy

- Add tests for shared layout, command search, selected state, draft state, consequence previews, and accessible names.
- Add a route coverage manifest so every current user-facing page is assigned to a redesign phase and verification state.
- Add browser smokes at wide desktop, standard desktop, and mobile sizes for admin, manager, and member flows.
- Use automated accessibility checks plus manual keyboard verification for each route family.
- Run focused lint/type/tests per task and the full lint, type, test, and build suite at every phase gate.
- Run Supabase checks only when search indexes, generated types, RLS, RPCs, storage, or seed data change.

## Non-Goals

- No redesign-driven schema rewrite.
- No generic workflow engine or universal dashboard framework.
- No removal of inspectors, drawers, tables, URL-backed filters, pagination, or archive/restore flows.
- No management-company payroll, overhead, P&L, tax, general-ledger, or ERP UI.
- No broad route renaming or navigation consolidation that changes product behavior.
- No decorative marketing composition inside authenticated workspaces.
