# Goal: Research-led enterprise frontend redesign

**Status:** Approved for execution
**Scope:** Entire Nestory application
**Delivery boundary:** Review-ready isolated local branch; do not push, merge, deploy, or modify production

## Goal command

Use this sentence when starting the implementation session:

> Complete `docs/enterprise-frontend-redesign-goal.md` end to end. Continue until every completion gate in the document is satisfied. Do not stop after research, an audit, a design specification, a prototype, or a partial route migration.

This document is the complete execution contract. The implementation session should not need the conversation that produced it.

## Progress protocol

The checkboxes in this document are the live completion ledger.

- Change `[ ]` to `[x]` only after the work is implemented and supported by current evidence.
- Update this document in the same branch as the implementation so progress survives session compaction or handoff.
- Do not delete, weaken, or silently reinterpret an unmet requirement to make the checklist appear complete.
- Record an approved deviation beside the affected requirement and link it to the design or verification evidence.
- A checked box is not evidence by itself. Tests, browser results, artifacts, or documented inspection must support the claim.
- Keep the goal active while any requirement is unfinished and not genuinely blocked.

## Outcome

Redesign and implement the complete Nestory frontend as one coherent, professional, enterprise-grade property-operations platform.

This is a structural and product-level redesign, not a cosmetic refresh. The executor may rethink navigation, information architecture, page responsibilities, layouts, interaction patterns, workflows, routes, supporting data structures, and documented product constraints when a better solution is justified.

The finished product must be compact, operationally efficient, role-aware, responsive, accessible, visually restrained, and fully implemented with real application behavior.

## Authority and precedence

Apply these sources in this order:

1. The explicit product-owner decisions in this goal document.
2. Security, tenant-isolation, data-integrity, financial-correctness, auditability, and traceability requirements.
3. Current runtime behavior, database contracts, generated types, tests, and executable route coverage.
4. `PROJECT.md` and existing design or handoff documents as current context.

`PROJECT.md` is a baseline, not an immutable constraint. The executor is authorized to revise any boundary in it when user research, enterprise-pattern research, workflow evidence, or a materially stronger product model justifies the change.

Existing UI audits, design specs, plans, prototypes, and `docs/codex-ui-ux-remediation-prompt.md` are evidence sources. They do not constrain this redesign when they conflict with this goal.

## Scope

Account for every user-facing surface:

- Public landing and information-request flows
- Authentication, recovery, invitations, onboarding, acceptance, and no-access experiences
- Every authenticated route in `config/ui-route-coverage.json`
- Super Admin, Finance Manager, Finance Member, Operations Manager, and Operations Member experiences
- Role-specific home, overview, navigation, priorities, queues, and assigned work
- Properties, units, people, ownership, vendors, staff, leases, rent, invoices, payments, finance, maintenance, documents, photos, imports, reports, settings, access management, search, activity, and supporting workflows
- Loading, skeleton, empty, filtered-empty, error, offline or retry, validation, success, confirmation, destructive-action, permission-denied, and unavailable states
- Desktop, tablet, and mobile layouts
- Complete light and dark themes

Every current capability must be inventoried and intentionally placed. A capability may be consolidated, relocated, or redesigned, but it must not disappear silently.

## Product-owner direction

The following decisions are approved and do not require another design-direction discussion:

- Use a research-led, system-first migration.
- Optimize for operational speed and clarity.
- Use compact information density without making screens cramped.
- Allow full structural redesign rather than preserving the current platform layout.
- Use restrained Nestory branding: neutral surfaces, one quiet accent, and subtle product identity.
- Use minimal flavor copy and very little explanatory text.
- Use container outlines, cards, borders, shadows, and boxed sections sparingly.
- Show only what the current user needs to understand, decide, navigate, or act.
- Preserve and account for all capabilities while avoiding duplicated information.
- Make navigation and home experiences deliberately role-specific.
- Use an adaptive sidebar for every role; do not produce non-admin roles by hiding most of the Super Admin sidebar.
- Design desktop-first while making every essential workflow usable on tablet and mobile.
- Treat light and dark themes as equal, first-class outputs.
- Meet WCAG 2.2 AA throughout.
- Use selective premium motion without slowing repeated operational work.
- Keep the public landing hero's concept, content, identity, and overall composition; refine its execution.
- Redesign the remaining landing sections simply, using the hero's typography and shared visual language.
- Generate one purposeful editorial-style image of a professional property-operations team at work.
- Use clean shadcn/ui primitives as much as practical.
- Work autonomously on routine decisions.
- Finish on a committed, review-ready isolated local branch.

## Current-state and safety gate

Before implementation:

- [ ] Read this document completely.
- [ ] Read `PROJECT.md`, `config/ui-route-coverage.json`, current route files, shared layout components, `components.json`, theme files, tests, and relevant database contracts.
- [ ] Inspect `git status`, the current branch, recent commits, and `git worktree list --porcelain`.
- [ ] Identify all active worktrees and ownership boundaries before choosing files or a base commit.
- [ ] Use the current intended integration base; do not assume `origin/main` is newer or authoritative.
- [ ] Create a dedicated worktree and `codex/`-prefixed branch for this goal.
- [ ] Keep all implementation out of the root checkout and other active worktrees.
- [ ] Record the base branch, base SHA, worktree path, and new branch in the research document.
- [ ] Preserve unrelated tracked and untracked user work.
- [ ] Confirm that browser and database verification will use isolated local or test resources, never production data.

Do not prune, reset, overwrite, merge, rebase, push, deploy, or alter another worktree as part of setup.

## Phase 1: Inventory and research

### Product inventory

Create `docs/research/enterprise-frontend-redesign-research.md` and include:

- [ ] An exact route inventory derived from the executable manifest and current application
- [ ] A route-to-surface map for public, authentication, onboarding, workspace, settings, and system pages
- [ ] A role-to-route and role-to-capability matrix
- [ ] A workflow inventory covering every major end-to-end operating journey
- [ ] An inventory of shared primitives, feature components, page shells, layout wrappers, tables, forms, dialogs, drawers, filters, status treatments, and feedback patterns
- [ ] An inventory of duplicated information, duplicated actions, hand-rolled primitives, inconsistent spacing, redundant containers, and competing sources of layout ownership
- [ ] A state inventory for loading, empty, error, permission, confirmation, success, and destructive flows
- [ ] Current responsive, theme, keyboard, zoom, and accessibility failures
- [ ] Existing behavior and tests that must be migrated rather than accidentally removed

### Enterprise research

Research current professional enterprise products through their live public interfaces, official product material, or primary documentation. Stripe and Vercel are required references. Select additional products according to the interaction problem instead of copying a single product wholesale.

Study and record patterns for:

- [ ] Global, domain, and role-specific navigation
- [ ] Adaptive sidebars for broad and narrow roles
- [ ] Role-specific home pages, task queues, and operational priorities
- [ ] Dense data tables, records, timelines, and side panels
- [ ] Search, command interfaces, filtering, sorting, and saved context
- [ ] Forms, field grouping, drawers, dialogs, and multi-step work
- [ ] Approvals, assignments, exceptions, and recovery loops
- [ ] Settings, access management, and dangerous actions
- [ ] Loading, empty, error, permission, and confirmation states
- [ ] Responsive enterprise workflows
- [ ] Light and dark theme behavior
- [ ] Accessibility, keyboard operation, focus, and zoom
- [ ] Marketing-to-product visual continuity

For each adopted or rejected pattern, document the observed problem, relevant reference, decision, Nestory adaptation, and reason. Synthesize patterns; do not clone another company's branding or page design.

## Phase 2: Design architecture

Create `docs/design/enterprise-frontend-redesign-system.md` before broad route migration. It must define the following at an implementation-ready level.

### Information architecture

- [ ] Product-wide hierarchy and domain grouping
- [ ] Route responsibilities and any proposed route consolidation or replacement
- [ ] Canonical location for every capability
- [ ] Canonical location for repeated facts, statuses, counts, and actions
- [ ] Cross-record navigation and contextual transitions
- [ ] Search and command behavior
- [ ] Mobile information hierarchy and navigation

### Role architecture

Define a deliberate home and adaptive sidebar for all five roles.

- [ ] Super Admin
- [ ] Finance Manager
- [ ] Finance Member
- [ ] Operations Manager
- [ ] Operations Member

Do not build lower-access roles by rendering an almost-empty administrator navigation model. Each role's navigation must be composed around real responsibilities, relevant records, assigned work, decisions, recent activity, and legitimate destinations. Do not invent filler pages to make a sidebar look balanced.

### Interaction architecture

- [ ] Page anatomy and single layout owner
- [ ] Page header, toolbar, action, filter, and view-switching rules
- [ ] List, table, record-detail, timeline, form, queue, and settings patterns
- [ ] Dialog, drawer, sheet, popover, menu, command, and confirmation rules
- [ ] Loading, empty, error, success, retry, and permission-state rules
- [ ] Destructive-action and irreversible-decision rules
- [ ] Motion rules and reduced-motion behavior
- [ ] Responsive transformations by component and workflow

### Visual system

- [ ] Typography scale and roles
- [ ] Compact spacing scale and layout grid
- [ ] Responsive page gutters and width rules
- [ ] Neutral palette and one restrained Nestory accent
- [ ] Complete semantic tokens for light and dark themes
- [ ] Border, separator, radius, shadow, and elevation rules
- [ ] Status and financial-state color rules
- [ ] Icon sizing and usage
- [ ] Focus, selection, hover, pressed, disabled, and drag states
- [ ] Data-density rules for tables, forms, and records

The system must rely on hierarchy, spacing, alignment, grouping, position, and subtle surface changes before adding cards, borders, or containers.

## Primitive-first implementation

Use the existing shadcn/ui setup as the default component foundation.

- [ ] Inspect `components.json` and the existing primitive source before adding or replacing components.
- [ ] Prefer existing Button, Input, Label, Textarea, Select, Checkbox, Radio, Switch, Table, Tabs, Dialog, AlertDialog, Sheet, DropdownMenu, Command, Popover, Tooltip, Badge, Skeleton, Separator, ScrollArea, and related primitives over raw or hand-rolled equivalents.
- [ ] Preserve the underlying primitive's semantics, keyboard operation, focus behavior, and accessibility when customizing it.
- [ ] Compose primitives into Nestory workflows; do not treat a stock shadcn example as a finished product screen.
- [ ] Use Card only when content genuinely needs a contained surface.
- [ ] Do not install every available component indiscriminately.
- [ ] Do not create wrappers that merely reproduce an existing primitive with another name.
- [ ] Use theme tokens and shared variants instead of scattered colors, spacing values, radii, or duplicated class strings.
- [ ] Create a new shared abstraction only for a stable, repeated product pattern with a clear responsibility.
- [ ] Remove superseded hand-rolled controls only after all consumers and tests are migrated safely.

shadcn/ui is a source-owned primitive system, not permission to ship a generic shadcn dashboard or to cover every page in cards.

## Information discipline

Avoid duplicated information and actions.

- [ ] Give each fact one authoritative presentation within the current context.
- [ ] Show summaries only when they help the user make a decision.
- [ ] Link or transition to canonical detail instead of reproducing it nearby.
- [ ] Do not repeat the same status, count, metadata, action, or explanation across headers, cards, tables, sidebars, and detail panels.
- [ ] Remove redundant page titles, breadcrumbs, action buttons, labels, badges, and callouts.
- [ ] Use one data source and one shared presentation pattern for repeated concepts.
- [ ] Keep essential labels and instructions required for accessibility and error prevention.

Minimal copy must still be precise. Prefer direct labels, concrete statuses, and short recovery instructions over flavor text or paragraphs that restate the interface.

## Spacing and layout

Establish one compact spacing and layout system.

- [ ] Define one owner for page gutters and outer content padding.
- [ ] Align page headers, navigation, filters, toolbars, tables, records, and pagination to deliberate shared edges.
- [ ] Keep related elements close and separate unrelated regions with space before introducing containers.
- [ ] Use consistent vertical rhythm and responsive gutters.
- [ ] Let dense tables and operational views use available width.
- [ ] Constrain reading-oriented content and focused forms when full width would reduce comprehension.
- [ ] Eliminate arbitrary padding, accidental empty areas, double gutters, nested scrolling, detached pagination, and inconsistent content widths.
- [ ] Verify hierarchy and spacing at every supported breakpoint and at 200% zoom.

Minimal does not mean sparse. Dense does not mean cramped.

## Public landing page

Preserve the current hero's concept, content, identity, and overall composition. It may be refined for typography, spacing, responsiveness, accessibility, component quality, and visual coherence.

Redesign the remaining landing sections freely:

- [ ] Use the hero's typography and the shared Nestory design language.
- [ ] Keep the page simple, concise, credible, and visually connected to the product.
- [ ] Avoid repetitive feature-card grids, excessive marketing copy, decorative containers, and duplicated claims.
- [ ] Use a small number of strong sections with clear hierarchy.
- [ ] Keep the public site slightly more expressive than the workspace without becoming a separate brand.

Generate one original editorial-style image of a professional property-operations team coordinating real work.

- [ ] The image feels grounded, contemporary, credible, and relevant to property operations.
- [ ] It does not resemble generic luxury real-estate marketing or staged corporate stock.
- [ ] It is visually compatible with Nestory's restrained palette and composition.
- [ ] It is inspected at full resolution, cropped responsively, optimized for web delivery, and supplied with meaningful alt text.
- [ ] The section remains understandable and usable if the image fails to load.

Do not add more generated imagery merely to fill space.

## Motion

Use selective premium motion for continuity and polish.

- [ ] Apply motion to meaningful page transitions, state changes, disclosure, drawers, dialogs, menus, and navigation continuity.
- [ ] Keep repeated operational actions and feedback fast.
- [ ] Do not use looping decoration, excessive parallax, dramatic transforms, or uniform entrance animation on every element.
- [ ] Motion must not conceal state, delay action, or compete with important data.
- [ ] Honor `prefers-reduced-motion` completely.

## Product-contract changes

This goal authorizes justified changes to routes, workflows, backend support, data structures, role presentation, and documented product boundaries.

Every override of `PROJECT.md` or another product contract must be recorded in the design document and must:

1. Identify the exact existing constraint.
2. Explain the user or operational problem it causes.
3. Provide research or product evidence for the replacement.
4. Describe affected roles, permissions, routes, data, workflows, migrations, and tests.
5. Preserve or strengthen security, tenant isolation, financial correctness, auditability, and traceability through the replacement model.
6. Update `PROJECT.md`, implementation, migrations, generated types, tests, route coverage, and related documentation in the same cohesive change.

Do not override a contract solely for visual preference, implementation convenience, abstraction purity, or speculative scope expansion.

This authorization does not permit destructive production migration, production data mutation, weakened authorization, silent history loss, fabricated financial authority, or deployment. If a proposed model cannot be validated safely and locally, document the blocker instead of pretending it is complete.

## Phase 3: Foundation implementation

- [ ] Implement the approved token, theme, typography, spacing, and layout foundations.
- [ ] Implement complete light and dark themes.
- [ ] Implement the adaptive application shell and all five role-specific sidebars.
- [ ] Implement global and contextual search or command behavior.
- [ ] Implement shared responsive navigation.
- [ ] Implement canonical page, table, record, form, queue, filter, dialog, drawer, feedback, and system-state patterns.
- [ ] Add focused component tests for shared behavior before broad migration.
- [ ] Keep the application coherent and testable at the end of the phase.

## Phase 4: Complete surface migration

Migrate the whole product. The executor may adjust ordering to follow dependency boundaries, but must track every surface in the route and capability matrices.

- [ ] Public landing and information request
- [ ] Authentication, recovery, invitation, onboarding, and no-access
- [ ] Role-specific homes and overview experiences
- [ ] Properties and units
- [ ] People, owners, vendors, staff, and access relationships
- [ ] Leases, occupancy, billing terms, rent, invoices, and collections
- [ ] Finance queues, expenses, approvals, balances, payments, distributions, petty cash, and Ledger
- [ ] Maintenance requests, assignments, coordination, completion, and Finance handoff
- [ ] Documents, photos, evidence, and imports
- [ ] Reports, exports, owner close, and publication
- [ ] Timeline, activity, search, and cross-record navigation
- [ ] Organization, role, access, branch, theme, and other settings
- [ ] Loading, empty, error, permission, confirmation, success, and destructive states
- [ ] Tablet and mobile transformations for every essential workflow

Do not mark a module complete while it still depends on an unplanned legacy layout, duplicated source of truth, dead control, mock behavior, or inaccessible interaction.

## Accessibility requirements

Meet WCAG 2.2 AA throughout.

- [ ] Full keyboard operation
- [ ] Predictable focus order and visible focus
- [ ] Correct focus restoration after overlays and mutations
- [ ] Semantic landmarks, headings, labels, names, descriptions, and relationships
- [ ] Screen-reader-compatible errors, status changes, and async feedback
- [ ] Sufficient contrast in light and dark themes
- [ ] Meaning is never communicated only through color
- [ ] Reduced-motion support
- [ ] Appropriate touch targets
- [ ] Accessible dialogs, menus, tables, forms, filters, notifications, and destructive confirmations
- [ ] Clear validation and recovery
- [ ] Usability at 200% zoom without lost content or functionality

## Required verification

Create and maintain:

- `docs/verification/enterprise-frontend-redesign-evidence.md`
- A machine-readable route-role-state acceptance matrix under `artifacts/enterprise-frontend-redesign/`
- Visual evidence under `artifacts/enterprise-frontend-redesign/`

The evidence must record commands, environment, branch, SHA, fixture or database target, date, pass or fail result, and honest limitations.

### Acceptance matrix

Verify:

- [ ] Every route in the executable manifest
- [ ] Every role allowed on each route
- [ ] Allowed, restricted, unavailable, and permission-denied states
- [ ] Every major end-to-end workflow
- [ ] Every role-specific home and sidebar
- [ ] Representative dense, normal, sparse, and empty datasets
- [ ] Loading, validation, error, retry, success, confirmation, and destructive states
- [ ] Desktop, tablet, and mobile breakpoints
- [ ] Light and dark themes
- [ ] Keyboard-only operation
- [ ] Focus management
- [ ] Screen-reader semantics
- [ ] 200% zoom
- [ ] Responsive overflow, table behavior, drawers, dialogs, and navigation
- [ ] Generated landing image behavior and fallback
- [ ] Reduced-motion behavior

### Engineering gates

Run the current equivalent of every relevant gate. At minimum, the current repository exposes:

- [ ] `npm run lint`
- [ ] `npm run test:all`
- [ ] `npm run test:ui-copy`
- [ ] `npm run test:ui-coverage`
- [ ] `npm run test:ui-redesign`
- [ ] `npm run test:ui-a11y`
- [ ] `npx tsc --noEmit`
- [ ] `npm run build`
- [ ] `git diff --check`

Also run all targeted workflow, concurrency, database, route-discoverability, storage, reporting, and browser suites affected by the final diff. If a contract or database change is made, run the relevant Supabase lint, generated-type, migration, RLS, RPC, and local reset verification.

Do not copy historical test totals into the evidence. Record fresh results from the final commit.

## Prohibited shortcuts

- Do not stop at an audit, design document, prototype, shell, component library, or representative subset of routes.
- Do not redesign only Super Admin and call the role system complete.
- Do not create lower-access navigation by hiding most administrator entries.
- Do not invent filler pages, placeholder data, fake queues, or UI-only actions.
- Do not remove a capability because it is difficult to place.
- Do not preserve duplicated information merely because existing pages show it.
- Do not replace working behavior with mocks.
- Do not use cards, borders, gradients, or animation as substitutes for information hierarchy.
- Do not add verbose helper text to compensate for unclear layout or labels.
- Do not create a generic workflow engine, universal dashboard, or speculative abstraction to solve a local design problem.
- Do not weaken server authorization because a control is hidden in the UI.
- Do not claim production, device, browser, role, or accessibility verification that was not actually performed.

## Completion gate

The goal is complete only when all of the following are true:

- [ ] Every checklist item in this document is completed or has a documented, evidence-backed blocker.
- [ ] Every current capability is present in the inventory and intentionally placed.
- [ ] Every route is redesigned and implemented, or explicitly justified with current evidence as already compliant.
- [ ] Every role has a deliberate home, sidebar, priorities, navigation, and workflow experience.
- [ ] The entire application uses one coherent enterprise design language.
- [ ] shadcn/ui primitives are used wherever they are the cleanest valid foundation.
- [ ] Duplicate information, actions, layout wrappers, and competing component patterns are removed.
- [ ] Spacing, alignment, responsive behavior, and information density are consistent.
- [ ] Public, authentication, workspace, settings, report, and system-state surfaces are complete.
- [ ] Light and dark themes are complete.
- [ ] WCAG 2.2 AA acceptance passes.
- [ ] The full route-role-state acceptance matrix passes.
- [ ] All required engineering gates pass on the final commit.
- [ ] No real workflow is replaced by a mock, placeholder, dead control, or invented result.
- [ ] Every justified product-contract change is implemented and documented consistently.
- [ ] Research, system design, verification evidence, and visual artifacts are complete.
- [ ] The isolated branch is clean except for explicitly documented artifacts.
- [ ] The finished work is committed locally.

A blocker is not a shortcut. It must state the exact failing condition, evidence, attempted remedies, impact, and the smallest user or external action required. Unfinished work without a genuine blocker means the goal remains active.

## Required closeout report

At completion, report:

1. Worktree path and branch
2. Base branch and base SHA
3. Final local SHA and cohesive commit list
4. Local branch divergence from its base and remote counterpart
5. Exact changed and untracked-file status
6. Research references and major adopted or rejected patterns
7. Information architecture and role-navigation changes
8. Major shared primitives and removed duplications
9. Every `PROJECT.md` or product-contract override and its justification
10. Route-role-state acceptance totals
11. Engineering command results from the final commit
12. Paths to research, design, verification, and visual evidence
13. Honest limitations or blockers

Do not push, merge, deploy, alter production, or clean up other worktrees. Stop at the committed review-ready local branch and wait for product-owner review.
