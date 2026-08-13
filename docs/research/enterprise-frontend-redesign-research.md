# Enterprise frontend redesign research

**Research date:** 2026-08-13
**Base branch:** `main`
**Base SHA:** `b4754f486e82ebd1ec00311936f42125e0895017`
**Worktree:** `D:\nestory\.worktrees\enterprise-frontend-redesign`
**Implementation branch:** `codex/enterprise-frontend-redesign`
**Verification boundary:** local application and the disposable local Supabase stack only. No production data, hosted mutation, deploy, push, merge, or remote migration is permitted.

## Research method

This inventory was derived from the executable route contract, actual App Router files, shared layout and primitive source, feature components, authorization capabilities, database migrations and generated types, current tests, the August 12 UI audit, and live primary product/design-system documentation. The local `main` checkout, not `origin/main`, is the integration base because it contains eleven intended local commits not present on the remote.

The starting `npm run test:all` run executed 221 Vitest files and 1,565 tests. It passed 220 files / 1,564 tests; the sole failure was a 10-second timeout in the filesystem-backed PNG evidence test while the suite was running in parallel. The exact test then passed alone in 2.14 seconds, and its complete file passed 46/46 in 2.28 seconds. This is recorded as a timing-sensitive baseline limitation, not treated as passing full-suite evidence.

## Exact executable route inventory

The current manifest contains 47 user-facing routes: 29 workspace, 6 detail, 4 settings, 2 public, and 6 authentication/system routes. `public` and `unlinked` are states rather than workspace roles.

| Route | Surface | Allowed roles | Declared states |
| --- | --- | --- | --- |
| `/` | Public | Public | Populated |
| `/request` | Public intake | Public | Draft, saving, error, success |
| `/login` | Authentication | Public | Draft, saving, error, success |
| `/forgot-password` | Authentication | Public | Draft, saving, success, error |
| `/update-password` | Authentication | Public | Draft, saving, success, error |
| `/auth/complete` | Authentication | Public | Loading, error |
| `/accept-invite` | Invitation | Public | Draft, saving, success, error, permission blocked |
| `/no-access` | System | Unlinked user | Permission blocked |
| `/workspace` | Role entry | All five roles | Populated, permission blocked |
| `/overview` | Admin home | Super Admin | Loading, populated, empty, filtered empty, error, permission blocked |
| `/overview/[view]` | Admin detail | Super Admin | Loading, populated, error, permission blocked |
| `/properties` | Portfolio register | Super Admin | Loading, populated, empty, filtered empty, error, permission blocked, draft, saving, success |
| `/properties/setup` | Guided setup | Super Admin | Loading, populated, empty, error, permission blocked, draft, saving, success |
| `/properties/[propertyId]` | Property record | Super Admin | Loading, populated, empty, filtered empty, error, permission blocked, draft, saving, success |
| `/properties/[propertyId]/account` | Property account | Super Admin, Finance Manager, Finance Member | Loading, populated, empty, error, permission blocked, draft, saving, success |
| `/units` | Unit register | Super Admin | Loading, populated, empty, filtered empty, error, permission blocked, draft, saving, success |
| `/units/[unitId]` | Unit record | Super Admin | Loading, populated, empty, filtered empty, error, permission blocked, draft, saving, success |
| `/people` | People directory | Super Admin | Loading, populated, empty, error, permission blocked |
| `/people/[personId]` | Person record | Super Admin | Loading, populated, empty, filtered empty, error, permission blocked, draft, saving, success |
| `/owners` | Owner register | Super Admin | Loading, populated, empty, filtered empty, error, permission blocked, draft, saving, success |
| `/staff` | Staff register | Super Admin | Loading, populated, empty, filtered empty, error, permission blocked, draft, saving, success |
| `/tenants` | Tenant register | Super Admin | Loading, populated, empty, filtered empty, error, permission blocked, draft, saving, success |
| `/vendors` | Vendor register | Super Admin | Loading, populated, empty, filtered empty, error, permission blocked, draft, saving, success |
| `/leases` | Lease register | Super Admin, Finance Manager, Finance Member | Loading, populated, empty, filtered empty, error, permission blocked, draft, saving, success |
| `/finance` | Finance home and queue | Super Admin, Finance Manager, Finance Member | Loading, populated, empty, error, permission blocked, draft, saving, success |
| `/rent-income` | Rent operations | Super Admin, Finance Manager, Finance Member | Loading, populated, empty, filtered empty, error, permission blocked, draft, saving, success |
| `/bills-expenses` | Paid-cost operations | Super Admin, Finance Manager, Finance Member | Loading, populated, empty, filtered empty, error, permission blocked, draft, saving, success |
| `/balances` | Owner balances | Super Admin, Finance Manager, Finance Member | Loading, populated, empty, error, permission blocked, draft, saving, success |
| `/ledger` | Operational ledger | Super Admin, Finance Manager, Finance Member | Loading, populated, empty, filtered empty, error, permission blocked, draft, saving, success |
| `/petty-cash` | Petty cash | Super Admin, Finance Manager, Finance Member | Loading, populated, empty, filtered empty, error, permission blocked, draft, saving, success |
| `/reports` | Report catalog | Super Admin, Finance Manager | Populated, permission blocked |
| `/reports/[reportKind]` | Report detail/export | Super Admin, Finance Manager | Loading, populated, empty, filtered empty, error, permission blocked |
| `/maintenance` | Operations Manager home/cases | Super Admin, Operations Manager | Loading, populated, empty, filtered empty, error, permission blocked, draft, saving, success |
| `/tasks` | Assigned work | Super Admin, Operations Manager, Operations Member | Loading, populated, empty, filtered empty, error, permission blocked, draft, saving, success |
| `/recurring-tasks` | Recurring work | Super Admin, Operations Manager | Loading, populated, empty, filtered empty, error, permission blocked, draft, saving, success |
| `/inspections` | Inspections | Super Admin, Operations Manager | Loading, populated, empty, filtered empty, error, permission blocked, draft, saving, success |
| `/work-orders` | Work orders | Super Admin, Operations Manager | Loading, populated, empty, filtered empty, error, permission blocked, draft, saving, success |
| `/timeline` | Global records | Super Admin | Loading, populated, empty, filtered empty, error, permission blocked, draft, saving, success |
| `/property-timeline` | Property records | Super Admin | Loading, populated, empty, filtered empty, error, permission blocked, draft, saving, success |
| `/maintenance-timeline` | Maintenance records | Super Admin | Loading, populated, empty, filtered empty, error, permission blocked, draft, saving, success |
| `/financial-timeline` | Financial records | Super Admin | Loading, populated, empty, filtered empty, error, permission blocked, draft, saving, success |
| `/documents` | Documents/evidence | Super Admin | Loading, populated, empty, filtered empty, error, permission blocked, draft, saving, success |
| `/import` | Staged imports | Super Admin | Loading, populated, empty, filtered empty, error, permission blocked, draft, saving, success |
| `/settings` | Workspace settings | Super Admin | Loading, populated, empty, error, permission blocked, draft, saving, success |
| `/settings/rent-policy` | Rent policy | Super Admin, Finance Manager | Populated, empty, error, permission blocked, draft, saving, success |
| `/users-roles` | Workspace access | Super Admin | Loading, populated, empty, error, permission blocked, draft, saving, success |
| `/account` | Personal account | All five roles | Loading, populated, error, permission blocked |

## Route-to-surface map

| Surface family | Canonical responsibility | Routes |
| --- | --- | --- |
| Public | Explain the product and persist an information request | `/`, `/request` |
| Identity | Sign in, recover, replace password, complete callbacks, accept invitations | `/login`, `/forgot-password`, `/update-password`, `/auth/complete`, `/accept-invite` |
| Entry/system | Resolve role home or explain missing access | `/workspace`, `/no-access` |
| Role homes | Present the current role's priorities and next work | `/overview`, `/finance`, `/maintenance`, `/tasks` |
| Portfolio records | Canonical property, unit, person and relationship records | `/properties`, `/properties/setup`, `/properties/[propertyId]`, `/units`, `/units/[unitId]`, `/people`, `/people/[personId]`, `/owners`, `/staff`, `/tenants`, `/vendors` |
| Lease and finance | Authoritative terms, rent, paid costs, balances, ledger and cash controls | `/leases`, `/rent-income`, `/bills-expenses`, `/balances`, `/properties/[propertyId]/account`, `/ledger`, `/petty-cash`, `/finance` |
| Operations | Cases, assigned tasks, recurring definitions, inspections and work orders | `/maintenance`, `/tasks`, `/recurring-tasks`, `/inspections`, `/work-orders` |
| Evidence/history | Immutable/corrective history, documents and staged imports | `/timeline`, `/property-timeline`, `/maintenance-timeline`, `/financial-timeline`, `/documents`, `/import` |
| Reporting | Catalog, filters, PDF/Excel export, owner close/publication entry points | `/reports`, `/reports/[reportKind]` |
| Workspace management | Organization, rent policy, access, branches, appearance and personal account | `/settings`, `/settings/rent-policy`, `/users-roles`, `/account` |

## Role-to-route matrix

| Role | Home | Deliberate global destinations | Contracted route count |
| --- | --- | --- | ---: |
| Super Admin | `/overview` | Overview; Properties; People; Finance; Maintenance; Records; Reports; Settings; Account | 39 |
| Finance Manager | `/finance` | Finance work; Rent; Expenses; Owner balances; Leases; Ledger; Petty cash; Reports; Rent policy; Account | 13 |
| Finance Member | `/finance` | My finance work; Rent; Expenses; Owner balances; Leases; Ledger; Petty cash; Account | 10 |
| Operations Manager | `/maintenance` | Cases; Assigned work; Recurring work; Inspections; Work orders; Account | 7 |
| Operations Member | `/tasks` | My work; Account | 3 |

The current shell violates the intended architecture even though it reaches the correct routes: Finance destinations are produced by filtering the administrator array, and both Operations roles are constructed as reduced versions of one Maintenance domain. The redesign will define five independent navigation compositions with role-language, home priority, and legitimate destinations while retaining server authorization as the real boundary.

## Role-to-capability matrix

| Capability area | Super Admin | Finance Manager | Finance Member | Operations Manager | Operations Member |
| --- | --- | --- | --- | --- | --- |
| Organization/access/branches | Manage | None | None | None | None |
| Properties, units and people authority | Manage | Financial context only | Financial context only | Branch task context | Assigned task context |
| Lease configuration | Manage | Manage | Read | Scoped context only | Assigned context only |
| Finance read | All | All allowed | All allowed | None | None |
| Submit paid cost | Yes | No | Own submissions | Maintenance handoff only | No |
| Review paid cost | Yes | Yes | No | No | No |
| Correct finance / retry current rent | Yes | Guarded daily operations | No | No | No |
| Reverse approved expense | Yes | No | No | No | No |
| Petty cash / month locks | Manage | Guarded manager controls | Read only where routed | None | None |
| Owner opening authority | Submit, review, correct | Review/request correction | Submit/request correction | None | None |
| Owner close/publication | Close, reopen, publish | Close/publish after readiness | Inspect readiness/history | None | None |
| Coordinate operations | Yes | No | No | Branch scope | Assigned work only |
| Reports | Read/export/publish allowed products | Read/export | No report route | No | No |

### Super Admin bottleneck audit

The prior role split made Super Admin the only operator who could configure rent, review owner openings, close an owner month, or publish an owner statement. Those are recurring Finance duties, so keeping them in the organization-governance role created an unnecessary daily and month-end queue.

The implemented responsibility split is:

- **Finance Member prepares:** evidence-backed paid costs and owner-opening requests; rejected or incomplete work returns to the submitter.
- **Finance Manager reviews and completes routine Finance:** paid-cost review, guarded corrections and retry, rent-policy and lease billing configuration, independent owner-opening review, reconciled month close, official statement publication, and approved reports.
- **Super Admin governs and handles exceptions:** organization/access/branch and portfolio master setup, final membership protection, approved-expense reversal, closed-month reopen, incomplete-publication recovery, and any other explicitly exceptional authority.
- **Operations Manager coordinates a branch:** maintenance cases, recurring work, inspections, work orders, completion evidence, and Finance handoff.
- **Operations Member executes assigned work:** their sidebar and home remain deliberately narrow because assignment scope is a security boundary, not an incomplete administrator experience.

Maker-checker rules remain intact: a submitter cannot review the same owner-opening request. Finance Manager receives routine completion authority but not reopen, reversal, access governance, or master-data governance. This removes the recurring Super Admin dependency without converting the manager roles into broad administrators.

## End-to-end workflow inventory

1. **Public interest:** landing context -> information request form -> validation -> persisted intake -> success/error recovery.
2. **Invite-only access:** Super Admin invites -> recipient accepts with identity/password proof -> membership and role shape validate -> role home or typed no-access state.
3. **Account recovery:** request recovery -> callback/session completion -> replace password -> return to role entry without exposing secret material.
4. **Portfolio setup:** create property -> units -> people relationships/ownership -> documents/photos -> readiness gaps -> canonical property/unit/person records.
5. **Lease-to-rent:** Super Admin establishes property/person master data; Finance Manager or Super Admin creates the lease and authoritative term/parties/occupancy -> configures billing term and policy readiness -> activates/catches up -> resolves invoice/exception -> allocates payment or confirms direct-owner collection -> immutable Ledger event -> reports.
6. **Paid cost:** Finance Member/Super Admin submits evidence -> Finance Manager/Super Admin review -> atomic expense/payment/effect/Ledger/activity -> typed reject/resubmit or Super Admin reversal.
7. **Maintenance-to-Finance:** case intake -> assign/coordinate -> task completion evidence and actual cost -> Finance handoff -> review -> approved paid-cost flow.
8. **Owner opening authority:** roster/readiness -> Finance Member or Super Admin evidence-backed submission -> independent Finance Manager or Super Admin review/reject -> resubmit/correct -> immutable owner balance authority.
9. **Owner balances and distributions:** inspect movements/source drill-through -> guarded adjustments or distributions -> reversal/transfer remediation -> Ledger/activity parity.
10. **Owner close/publication:** readiness -> Finance Manager or Super Admin closes the exact owner/property/currency/month revision -> retain immutable evidence -> Finance Manager or Super Admin publishes numbered PDF and Excel -> Super Admin alone recovers an incomplete publication or reopens through checked authority.
11. **Staged import:** upload -> normalize/validate -> review invalid/ambiguous rows -> commit only safe rows -> retain visible failures and activity.
12. **Records/search:** global search or contextual link -> canonical record -> source-linked timeline/documents -> back to originating queue/filter without losing URL state.
13. **Settings/access:** edit organization/branch/appearance or member lifecycle -> dirty-state guard -> explicit save/consequence confirmation -> success/status history.

## Shared implementation inventory

### Foundations and shells

- `AppShell`, shadcn `Sidebar`, `WorkspaceCommandPalette`, `WorkspacePage`, `WorkspacePageContext`, `WorkspaceHeaderPortal`, `PageHeader`, `PageBreadcrumb`, `LocalWorkspaceNav`, `SettingsTabs`, `ModuleLoading`, and `WorkspaceSplitView`.
- Theme runtime, organization theme tokens, theme toggle, Geist Sans/Mono, root metadata, public/auth/workspace-specific surface tokens.
- Current ownership conflict: AppShell owns viewport height and content scrolling; WorkspacePage owns page padding; many feature screens add their own padding, width, height and scrolling; 46 references still depend on `WorkspaceSplitView`.

### Source-owned shadcn/Radix primitives

- Action/input: Button, Input, Textarea, Checkbox, Select, Toggle, date/month/time/number/search controls.
- Navigation/disclosure: Sidebar, Tabs, DropdownMenu, Popover-backed controls, Collapsible, Tooltip.
- Overlays: Dialog, AlertDialog, Sheet, SideDrawer, Modal, RecordQuickViewDialog, ConfirmationDialog.
- Data/state: Table, Badge, Skeleton, Separator, ScrollArea-like native wrappers, EmptyState, ErrorState, StatusNotice, TransientFeedback, DraftActionBar, ConsequencePanel.
- Form/workflow composition: RecordForm, FormSection, FileDropzoneField, FilterPopover and searchable select controls.

### Feature-owned surfaces

The 25 feature folders include account, activity, auth, configuration, documents, finance, finance operations, imports, leases, ledger, maintenance, marketing, organization, overview, owner balances, owner close, people, petty cash, photos, properties, property setup, reports, timeline, units, workspace operations and workspace search. Each loader/action remains feature-owned; the redesign changes presentation contracts without inventing a generic workflow engine.

### Tables, forms, filters and overlays

- Registers use feature tables plus `InteractiveTable`, but several still reproduce table chrome, search/filter rows, mobile fallbacks and quick views independently.
- Forms mix shared controls with 184 raw `<input>` occurrences outside `src/components/ui`; many are required hidden server-action values, but visible raw controls need migration.
- Seven overlapping overlay abstractions exist. Record inspection, focused writes, destructive confirmation and command/search are the only stable overlay responsibilities.
- Search is both global (`WorkspaceCommandPalette`) and local, but local toolbars frequently duplicate a text search, icon-only submit and advanced filter affordances.

## Duplicated information and layout inventory

Current source measurements (user-facing code unless noted):

| Finding | Evidence | Design consequence |
| --- | ---: | --- |
| `WorkspaceSplitView` references | 46 | Two-column/list-shell abstraction competes with route anatomy and creates nested scrolling. Retire after consumers migrate. |
| `WorkspacePage` references | 57 | Useful single outer owner, but feature-level padding must be removed. |
| `border border-border` occurrences | 333 | Containers are being used as default grouping. Reduce to semantic table/overlay/contained surfaces. |
| Arbitrary `text-[Npx]` sizes | 56 | Replace with one documented type scale. |
| Non-primitive `text-accent` uses | 17 | `accent` is a surface token, not the organization action color. |
| Raw visible/hidden input elements outside UI source | 184 | Classify hidden server fields; migrate visible fields to shared primitives. |
| Raw buttons outside UI source | 110 | Classify semantic special cases; migrate normal actions to Button variants. |
| Inconsistent radii | 27 `rounded-sm`, 7 `rounded-xl`, 7 `rounded-none` | Standardize compact controls, contained surfaces and pills. |
| Heading imbalance | 13 `<h1>`, 78 `<h2>` | Make PageHeader the route title owner and preserve semantic hierarchy. |
| Overflow declarations | 24 vertical, 20 horizontal | Give each page one vertical owner and only data regions deliberate horizontal behavior. |

Known duplicated content/actions from current inspection:

- Page title appears in breadcrumb/header and again inside several feature screens.
- Sidebar subroutes repeat local rails/tabs without a single rule for route versus in-page state.
- Readiness panels show successful facts that are already visible in record fields.
- People/lease rows repeat names or status in primary and supporting lines.
- Settings repeats organization/workspace scope in adjacent contained surfaces.
- Several list pages contain both an Enter-submitted search field and a redundant search button, two reset affordances, or an inert Done action.
- All-zero metric strips and invariant status columns occupy high-value space without changing a decision.

## State inventory

| State | Existing patterns | Required canonical treatment |
| --- | --- | --- |
| Loading | Route `loading.tsx`, ModuleLoading, Skeleton, occasional spinner | Archetype-matched skeleton with stable layout and announced busy region. |
| Empty | EmptyState, bespoke prose | State the fact once; show one legitimate next action only when authorized. |
| Filtered empty | EmptyState variants and query-aware screens | Name active scope and expose Clear filters without implying no underlying records. |
| Error/retry | ErrorState, StatusNotice, route error boundary | Keep stable context, describe failed operation, expose retry when safe. |
| Permission denied | StatusNotice/EmptyState and server context failures | Never render a disabled fake workspace; explain legitimate next step or return route. |
| Unavailable/blocked | Typed financial/readiness exceptions, warning panels | Preserve blocker authority, prerequisite, source and drill-through. Never fabricate a result. |
| Draft/dirty | DraftActionBar, Settings navigation guard, local draft hooks | One save/cancel owner, route-change protection and focusable validation summary. |
| Saving | Pending buttons/forms, aria-busy in some workflows | Preserve layout, disable only affected action, announce progress. |
| Success | TransientFeedback/StatusNotice/query flags | Name the completed action consistently and return focus to the affected context. |
| Confirmation | AlertDialog/ConfirmationDialog/consequence panels | Name record, scope, consequence and reversibility; safe action first in tab order. |
| Destructive | AlertDialog and server-checked archive/reverse flows | Require explicit target/consequence; never use color alone; restore focus on cancel/complete. |

## Responsive, theme and accessibility baseline

Current strengths:

- Source-owned Radix/shadcn primitives already provide accessible dialog/menu/selection semantics for many shared controls.
- A sidebar sheet exists for mobile, the manifest includes responsive smoke contracts, and several queues have mobile list transformations.
- Light/dark semantic tokens and reduced-motion rules exist; status meaning is usually paired with text.
- The evidence runner checks laptop/mobile viewports, Axe, keyboard traversal, CSS viewport equivalents for zoom, artifact dimensions and local-only safety.

Current failures or unproven areas:

- Nested height/overflow ownership can create double vertical scrollbars; 20 horizontal overflow declarations have not been reconciled against 200% zoom.
- Workspace Access and dense tables have known narrow-screen overflow risks.
- Only 13 explicit route-level H1 elements exist; heading ownership is inconsistent.
- Visible controls remain hand-rolled in feature code and some labels are not programmatically associated.
- Organization mode is persisted globally and only Super Admin receives the toggle, so other roles cannot exercise light/dark as a personal display preference.
- Two theme boot/runtime paths can disagree and flash before hydration.
- Reduced motion disables named landing/auth/quick-view animations, but not every transition utility is governed by one policy.
- Baseline browser, keyboard, focus restoration, screen-reader semantics and 200% zoom must be rerun after migration; source inspection is not acceptance evidence.

## Content-language and information-discipline baseline

The initial implementation review undercounted content debt by focusing on duplicated UI structure and prohibited phrase lint. A route can pass copy lint, axe, responsive smoke, and visual review while still forcing operators to interpret internal product or database language. This is a product-wide acceptance concern, not an Owner Balance exception.

The first cross-route scan found these recurring patterns:

| Surface family | Current pattern | Examples | Required disposition |
| --- | --- | --- | --- |
| Owner balances, opening balances and close | Internal accounting/implementation language is presented as the primary interface; raw hashes, watermarks, machine codes and JSON appear in default views. | `Authoritative owner balance`, `Roll-forward authority`, `Input watermark`, `Source fingerprint`, `roster hash`, raw remediation codes and serialized detail. | Rename the task in operator language; state the actionable blocker and next step; move exact provenance into collapsed Audit details. Preserve amounts, evidence requirements, approval state, reversal path and financial consequences. |
| Rent policy, setup and imports | `authority`, `cutover authority`, `persisted`, and hosted-activation mechanics are used where the operator needs a date, readiness fact, or action. | Rent policy authority, rent authority, authority start date, freeze imported authority. | Use policy, start date, imported records and readiness language. Keep the exact technical term only where it distinguishes legal/financial approval authority. |
| Finance and Ledger | Projection/source-system vocabulary and implementation explanation can displace the decision or exception. | `Current balance projection`, source-workflow explanations, correction/audit helper copy. | Lead with amount/status/affected record/next action; reserve projection for an actual forecast; move calculation/source provenance to Audit details. |
| Activity, timelines and record drawers | Helper text sometimes narrates obvious links or repeats the audit/history purpose already expressed by the surface. | `Opens the operational record that produced this audit entry`, repeated statements about retaining history. | Prefer direct action labels such as `Open record`; keep retention consequences only on archive/delete/restore decisions. |
| Properties, units, people and maintenance | Generic `workflow`, `canonical`, `active ... workflows`, and repeated role explanations appear in ordinary task copy. | Restore helper text and role/relationship explanations that repeat visible fields or actions. | Name the record and consequence directly. Preserve a role-versus-workspace-access distinction only where it prevents a permission mistake. |
| Public request and onboarding | Process commentary can read as internal qualification language rather than a concise user promise. | `Portfolio scope and workflow fit reviewed before workspace provisioning`. | State what the requester should expect in plain language and remove internal process flavor text that does not affect their action. |

This scan is evidence of the cross-product pattern, not completion evidence. The final acceptance matrix must include one content-review result for every executable route and record the disposition of each finding: remove, rename, shorten, preserve for safety, or move to technical/audit disclosure. Route review must include headings, labels, table columns, filters, actions, badges, helper paragraphs, system states, confirmation copy and disclosure content.

The review must distinguish necessary safety copy from verbosity. Permission boundaries, field validation, recovery, irreversible consequences, affected financial scope, evidence requirements and accessibility instructions remain visible in plain language. Implementation correctness, storage mechanics and raw audit values do not remain in the default task view merely because they are accurate.

### Route-by-route content disposition ledger

The complete machine-readable review is `config/enterprise-frontend-content-review.json`; `src/lib/ui/enterprise-content-review.test.ts` proves exact one-to-one coverage with all 47 executable routes and validates every recorded disposition. Each review covered headings, labels, table headers, filters, actions, badges, helper text, empty/error/blocked/success states, confirmations, disclosures, and generated labels.

| Route | Finding and disposition | Default technical metadata | Safety/recovery copy |
| --- | --- | --- | --- |
| `/` | Remove repeated feature-grid claims; keep the established hero and three concise proof/action sections. | Absent | N/A |
| `/request` | Rename internal workflow-fit qualification to a direct portfolio/priorities follow-up promise. | Absent | Preserved |
| `/login` | No jargon finding; labels and recovery action already direct. | Absent | Preserved |
| `/forgot-password` | No jargon finding; request, success and retry states already direct. | Absent | Preserved |
| `/update-password` | No jargon finding; requirements and recovery remain beside the action. | Absent | Preserved |
| `/auth/complete` | Shorten callback implementation language to sign-in progress and recovery. | Absent | Preserved |
| `/accept-invite` | Preserve the concise role/workspace-access distinction because it prevents an authorization mistake. | Absent | Preserved |
| `/no-access` | No jargon finding; unavailable state names the legitimate next step. | Absent | Preserved |
| `/workspace` | No copy surface beyond role resolution and typed access failure. | Absent | Preserved |
| `/overview` | Remove repeated zero-value summaries; lead with actionable non-zero work. | Absent | Preserved |
| `/overview/[view]` | Shorten repeated Overview explanation; selected queue/analysis owns the page. | Absent | Preserved |
| `/properties` | Rename restore consequence from workflow language to active property lists. | Absent | Preserved |
| `/properties/setup` | Rename authority language to the exact records and required readiness checks. | Absent | Preserved |
| `/properties/[propertyId]` | Remove repeated identity/readiness; keep unresolved repairs beside their action. | Absent | Preserved |
| `/properties/[propertyId]/account` | Rename actual balance projection to Current balances; preserve official-statement warning. | Absent | Preserved |
| `/units` | Register labels, filters, actions and empty states already use unit/occupancy language. | Absent | Preserved |
| `/units/[unitId]` | Remove repeated property/lease context; use canonical links. | Absent | Preserved |
| `/people` | Rename workflow/durable-record language to People lists, roles and linked work. | Absent | Preserved |
| `/people/[personId]` | Shorten repeated role explanation; retain only the workspace-access distinction. | Absent | Preserved |
| `/owners` | Rename generic People workflow language to ownership and reporting. | Absent | Preserved |
| `/staff` | Preserve staff-record versus workspace-access copy to prevent permission mistakes. | Absent | Preserved |
| `/tenants` | Rename generic workflow language to leases, occupancy and follow-up. | Absent | Preserved |
| `/vendors` | Rename generic workflow language to service work and maintenance links. | Absent | Preserved |
| `/leases` | Rename Rent authority to Rent terms. | Absent | Preserved |
| `/finance` | Rename role homes to Review queue and My finance work. | Absent | Preserved |
| `/rent-income` | Shorten source mechanics; lead with tenant, amount, due status and action. | Absent | Preserved |
| `/bills-expenses` | Move evidence fingerprint out of task rows and review facts into Audit details. | Disclosed | Preserved |
| `/balances` | Rename authority/roll-forward/remediation vocabulary; move hashes, watermarks, codes, raw IDs and structured detail into closed Audit/Technical details. | Disclosed | Preserved |
| `/ledger` | Rename source-workflow empty copy to No financial transactions have been recorded. | Absent | Preserved |
| `/petty-cash` | Preserve reconciliation only where it distinguishes non-ledger cash advances and posting consequences. | Absent | Preserved |
| `/reports` | Catalog labels and actions already name the report and output. | Absent | Preserved |
| `/reports/[reportKind]` | Shorten export explanation; tabs, filters and PDF/Excel actions carry meaning. | Absent | Preserved |
| `/maintenance` | Rename Workflow to Current stage and restore language to active maintenance lists. | Absent | Preserved |
| `/tasks` | Rename the Operations Member home to My work and expose assigned actions only. | Absent | Preserved |
| `/recurring-tasks` | Routine labels, schedule fields and states already use operational language. | Absent | Preserved |
| `/inspections` | Checklist, assignee and completion language already direct. | Absent | Preserved |
| `/work-orders` | Work-order status, assignment and completion language already direct. | Absent | Preserved |
| `/timeline` | Remove helper narration that repeats event, actor, scope, time and Open record. | Absent | Preserved |
| `/property-timeline` | Remove repeated scope explanation; URL scope and record links are canonical. | Absent | Preserved |
| `/maintenance-timeline` | Shorten source explanation; retain event, actor, time and affected record. | Absent | Preserved |
| `/financial-timeline` | Shorten repeated Ledger meaning; retain financial event and source link. | Absent | Preserved |
| `/documents` | Keep document/category/record/availability primary; integrity metadata is not a task-view fact. | Disclosed | Preserved |
| `/import` | Rename cutover/reconciliation mechanics; hide request keys; move manifest data and fingerprints into closed disclosures. | Disclosed | Preserved |
| `/settings` | Preserve organization-default versus personal-display copy because it prevents a scope mistake. | Absent | Preserved |
| `/settings/rent-policy` | Rename Policy authority and Lifecycle to Rent policy and Status; keep approval prerequisites. | Absent | Preserved |
| `/users-roles` | Preserve member/person/staff/role/scope distinctions beside access changes. | Absent | Preserved |
| `/account` | Personal account labels and status/recovery copy already direct. | Absent | Preserved |

## Existing behavior and tests that must migrate intact

- The 47-route manifest, role access expectations, query contracts and declared state evidence.
- Capability-specific server contexts, checked RPCs, RLS, grants and fixed five-role invariants.
- URL-backed search/filter/sort/page/action state and link contracts between Overview, queues and target registers.
- Invitation/password proof, final-Super-Admin protection and no-access flow.
- Exact-decimal, idempotent, serialized financial mutations and source-linked Ledger/report projections.
- Lease-term, billing, rent-policy, generation-exception and historical recovery rules.
- Maintenance assignment and Operations-to-Finance handoff separation.
- Private document/photo storage, evidence immutability, staged imports and report artifact retention.
- Existing component tests for focus restoration, table semantics, system states, settings dirty navigation, shared controls and role navigation.
- Existing browser contract scripts for routes, roles, maintenance mobile, finance, rent, paid cost, owner authority/close/publication, storage and reporting.

## Enterprise pattern research and decisions

| Problem | Primary reference | Decision | Nestory adaptation and reason |
| --- | --- | --- | --- |
| Cross-domain lookup loses context | [Stripe Dashboard search](https://docs.stripe.com/dashboard/search?locale=en-GB) | Adopt | Keep one global Search or jump surface, group results by real record type, preserve organization/role scope, support identifiers and descriptive terms, and keep URL-backed local filters separate. |
| Global command surfaces become flat action soup | [Vercel Geist Command Menu](https://vercel.com/geist/command-menu) | Adopt selectively | Keep Ctrl/Cmd+K, recent/default results, arrows/Enter/Escape, focus trap/return and polite result count. Reject a generic command list that exposes unauthorized actions. |
| Filter state disappears on refresh/share | [Linear filters](https://linear.app/docs/filters) | Adopt | Preserve core filters in the URL, show applied scope compactly, and distinguish filter-empty from true empty. Do not add AI filtering or nested builders without a real Nestory need. |
| Saved view systems can become speculative infrastructure | [Linear custom views](https://linear.app/docs/custom-views) | Reject for this scope | Preserve shareable URL context and recent global search. Do not create a generic saved-view engine until repeated operational demand exists. |
| Role navigation is treated as one menu with hidden items | [Vercel access roles](https://vercel.com/docs/rbac/access-roles) and [Stripe teams](https://docs.stripe.com/get-started/account/teams) | Adopt responsibility-based composition | Define five independent navigation models around actual role authority. Hidden UI remains usability only; server authorization is unchanged. |
| Home pages become metric mosaics | [Stripe app surface guidance](https://docs.stripe.com/stripe-apps/design?locale=en-GB) and [Linear Inbox](https://linear.app/docs/inbox) | Adopt queue-first homes | Home exists only where relevant overview/attention material exists. Each role opens on decisions or assigned work; secondary context follows below. |
| Dense tables become walls of chrome | [Carbon data table usage](https://carbondesignsystem.com/components/data-table/usage/) and [Carbon table accessibility](https://preview.carbondesignsystem.com/building-blocks/core/components/data-table/accessibility) | Adopt | Use semantic tables at desktop, visible row hover even when non-interactive, `aria-sort`, named tables, explicit record links, contextual overflow only when needed, and mobile transformations where horizontal tables would hide primary action. |
| Side panels and dialogs are used interchangeably | [Stripe ContextView/FocusView](https://docs.stripe.com/stripe-apps/design?locale=en-GB) and [Primer Dialog accessibility](https://primer.style/product/components/dialog/accessibility/) | Adopt | Use a lightweight quick view only when surrounding context matters; use a focused drawer/modal for writes; use AlertDialog for destructive confirmation. Trap/restore focus and keep a visible title/close path. |
| Navigation changes do not communicate context | [Primer navigation](https://primer.style/product/ui-patterns/navigation/) | Adopt | Use links for new routes, tabs only for sibling views, clear parent return on detail routes, skip links around dense navigation/table blocks, and guard unsaved changes. |
| Audit/activity is shown as generic feed copy | [Vercel Activity Log](https://vercel.com/docs/activity-log) | Adopt | Keep chronological actor, event, scope and exact timestamp as canonical history; link to affected records and sources rather than duplicating narrative cards. |
| Enterprise settings hide consequences | [Stripe Apps quality requirements](https://docs.stripe.com/stripe-apps/review-requirements) | Adopt | One clear save path, current-location signposting, explicit destructive confirmations, descriptive failures and notices only for critical information. |
| Dark mode is an afterthought | [Vercel Geist colors](https://vercel.com/geist/colors) and [Theme Switcher](https://vercel.com/geist/theme-switcher) | Adopt token roles; adapt ownership | Use two structural backgrounds sparingly and semantic text/border/action scales in both modes. Keep organization accent centrally managed, but make light/system/dark a personal device preference for every role. |
| Marketing and product look unrelated | [Vercel Geist typography](https://vercel.com/geist/typography) and [Stripe component system](https://docs.stripe.com/stripe-apps/components) | Adopt | Reuse the same type family, neutral palette, spacing rhythm and action accent; allow the public surface more scale and photography while the workspace stays compact. |
| Accessibility is bolted on after visual QA | [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [W3C Reflow](https://www.w3.org/WAI/WCAG21/Understanding/reflow), and [W3C Target Size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum) | Adopt as a gate | Validate keyboard, focus order/visibility/restoration, names/relationships, 24px minimum targets, 200% text resize and reflow without lost workflow behavior. Tables remain the allowed two-dimensional exception only inside a named local region. |

## Research synthesis

Nestory should not imitate a single vendor. Stripe contributes contextual task focus and search; Vercel contributes disciplined command, token and audit patterns; Linear contributes URL-backed operational views and queue-first responsibility; Primer contributes navigation/focus contracts; Carbon contributes dense-table behavior; WCAG supplies the acceptance threshold.

The design thesis is **a quiet operating register with a visible chain of responsibility**. Records, queues and source evidence are primary. The signature is a restrained vertical record spine used only to connect a selected row, its quick view and its canonical detail—not a decorative accent on every container.

The visual system will use neutral structural surfaces, one organization accent for action/selection/focus, restrained semantic status colors, Geist Sans for interface text and Geist Mono for amounts/identifiers where scanning benefits. Layout uses one page-gutter owner, a compact 4/8-based rhythm and deliberate separators before contained cards. Motion is limited to shell/sidebar continuity, overlay disclosure and state replacement, with a complete reduced-motion override.
