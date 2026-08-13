# Enterprise frontend redesign system

**Status:** Approved goal translated to implementation architecture
**Research:** `docs/research/enterprise-frontend-redesign-research.md`
**Scope:** all 47 routes in `config/ui-route-coverage.json`, all five workspace roles, public/auth/system states, light/dark, desktop/tablet/mobile

## Design thesis

**Visual thesis:** a quiet operating register with a visible chain of responsibility—neutral paper-like surfaces, exact alignment, compact type, one restrained organization accent, and source evidence that remains visually connected to the record or queue item it explains.

**Content plan:** role priority first; canonical record or queue second; supporting evidence and history third; one clear next action. Public content keeps the existing building-led hero, then proves the team/workflow story with one editorial image, one product-control section and one final request action.

**Interaction thesis:** navigation and overlays maintain spatial continuity; selection uses one restrained record spine; task feedback replaces state quickly without celebration or delay. Nothing loops. Reduced motion removes translation, scale and smooth scrolling.

The intentional aesthetic risk is the record spine: a narrow accent line connects a selected register row, its quick view and the canonical record destination. It is meaningful traceability, not decoration. All other surfaces remain neutral and restrained.

## Product hierarchy and domain grouping

```text
Nestory
├─ Public
│  ├─ Product story
│  └─ Information request
├─ Identity and access
│  ├─ Sign in / recovery / password replacement
│  ├─ Invitation acceptance
│  └─ No access / role entry
└─ Workspace
   ├─ Role home
   ├─ Portfolio records
   │  ├─ Properties / units
   │  └─ People / owners / tenants / vendors / staff
   ├─ Lease and finance operations
   │  ├─ Leases / rent / paid costs
   │  ├─ Owner balances / property account
   │  └─ Ledger / petty cash / reports
   ├─ Property operations
   │  ├─ Cases / assigned tasks
   │  └─ Recurring work / inspections / work orders
   ├─ Evidence and history
   │  ├─ Records timelines
   │  └─ Documents / imports
   └─ Workspace management
      ├─ Organization / branch / appearance / rent policy
      ├─ Workspace access
      └─ Personal account
```

## Route responsibilities and disposition

No route is removed or replaced. Consolidation occurs in navigation and presentation, not by deleting capabilities. Every route remains canonical for one responsibility:

| Route family | Canonical responsibility | Redesign disposition |
| --- | --- | --- |
| `/`, `/request` | Public product story and persisted interest | Preserve hero thesis; replace repetitive post-hero grids with three strong sections and one generated editorial image. |
| `/login`, `/forgot-password`, `/update-password`, `/auth/complete`, `/accept-invite`, `/no-access` | Identity, invitation and access recovery | Use one auth shell, concise status copy, visible recovery, consistent field/control primitives and exact focus behavior. |
| `/workspace` | Role resolver | Remains a server redirect to the deliberate home for the resolved role. |
| `/overview`, `/finance`, `/maintenance`, `/tasks` | Role priorities and assigned work | Queue-first home archetype with non-zero signals and secondary context below. `/tasks` is both the Operations Member home and a legitimate manager/admin work route. |
| `/properties`, `/units`, `/people`, `/owners`, `/tenants`, `/vendors`, `/staff`, `/leases`, `/rent-income`, `/bills-expenses`, `/ledger`, `/petty-cash`, `/documents`, `/import` | Dense registers/workspaces | Standard register anatomy: PageHeader, at most one controls row, dominant semantic work surface, attached pagination, optional quick view. |
| `/properties/[propertyId]`, `/units/[unitId]`, `/people/[personId]`, `/properties/[propertyId]/account` | Canonical records | Record anatomy: identity/status header, local sections, decision fields, evidence/actions, source-linked history. |
| `/properties/setup`, `/settings`, `/settings/rent-policy`, `/users-roles`, `/account` | Focused setup/settings | One constrained content rail, one save owner, dirty navigation guard, explicit consequences. |
| `/reports`, `/reports/[reportKind]`, `/balances`, `/overview/[view]` | Catalog, analysis and authority views | Reading/decision layout with restrained width where useful; dense source tables remain full width. |
| `/property-timeline`, `/maintenance-timeline`, `/financial-timeline`, `/timeline` | Source-linked history | One Records vocabulary and one timeline/register pattern; scope is URL-backed and never repeated in a second summary panel. |

## Canonical location for capabilities

| Capability/fact | Canonical presentation | Elsewhere |
| --- | --- | --- |
| Role priorities | The role home queue | Links or compact non-zero counts only; never a duplicate queue. |
| Property/unit/person identity | Canonical detail record | Registers show only fields needed to identify and decide. |
| Lease terms and readiness | Lease register/detail/drawer | Property/unit records link to the lease; they do not reproduce the full term. |
| Rent obligation/payment state | Rent workspace and property account | Overview/Finance home shows only actionable exception counts and links. |
| Paid-cost review | Finance queue and Expenses workspace | Maintenance shows handoff status; it does not reproduce Finance review controls. |
| Owner authority/balance | Balances and property account | Reports and Finance queue deep-link to exact scope. |
| Immutable operational event | Records timeline / Ledger, according to source kind | Record pages show a short recent slice and link to the canonical history. |
| Documents/evidence | Documents plus source workflow attachment | Records show attachment presence/link, never duplicate metadata panels. |
| Access role/member lifecycle | Workspace Access | Person/Staff record shows link/status relationship only. |
| Organization/branch/appearance/rent policy | Settings route and named subsection | Shell consumes resolved values without duplicating editable controls. |
| Personal display theme and account data | Shell toggle / Account | Organization appearance supplies the shared accent and default mode only. |

## Cross-record navigation

- Every register has an explicit linked record name. A hover highlight alone never implies navigation.
- Selecting a row may open a quick view when comparison context matters. Enter performs the same action; Escape closes; focus returns to the trigger.
- Quick view contains only decision context and one `Open record` link. Editing uses a focused drawer/modal, never an inspector column.
- Detail pages provide a parent breadcrumb or explicit back link. Links from queues carry stable URL scope (filters/month/source) where the target supports it.
- Source-linked finance/history rows deep-link to the authoritative operational record. Raw UUIDs are not ordinary labels.
- Tabs are only for sibling sections under one record or settings parent. Routes in different domains remain sidebar or local-navigation links.

## Search and command behavior

- `Ctrl+K` / `Cmd+K` opens the one global `Search or jump` dialog. A visible trigger remains in the shell.
- Empty query shows recent legitimate destinations for the resolved role. Results group into pages, properties, units, people, leases, maintenance and documents only when authorized.
- Up/Down changes the active option; Enter activates; Escape closes; focus returns to the previous element. Result count is `aria-live="polite"`.
- The root view never mixes navigation results with destructive or mutating commands. Contextual actions stay on the current record/queue.
- Local register search and filters are URL-backed. Search terms, material filters, sort and page remain restorable/shareable; display density is a preference, not a business query.
- Active filter count excludes sort, page and page size. Filter-empty and true empty states remain distinct.

## Five independent role architectures

Navigation is defined as five explicit compositions. None is derived by filtering the Super Admin array.

### Super Admin

**Home:** `/overview`
**Priority:** unresolved portfolio, access, Finance and Operations exceptions across the organization
**Primary navigation:** Overview; Properties; People; Finance; Maintenance; Records
**Manage navigation:** Reports; Settings
**Account:** profile menu
**Quick create:** property-first create entry, with contextual create actions on registers.

The home starts with the highest-priority actionable exceptions, followed by portfolio context. It is the one permitted cross-domain control room; it does not duplicate complete Finance or Maintenance queues.

### Finance Manager

**Home:** `/finance`
**Priority:** oldest/highest-risk review, missing evidence, rent exceptions and guarded daily controls
**Primary navigation:** Review queue (`/finance`); Rent; Expenses; Owner balances; Leases; Ledger; Petty cash
**Manage navigation:** Reports; Rent policy
**Account:** profile menu

Labels name Finance responsibilities, not administrator domains. The manager can enter transaction work from the review queue, configure leases and rent policy, independently review owner openings, close reconciled locked months, and publish official statements. Review and completion actions render only where the server capability permits them; reopen, reversal, access and master-data governance remain absent.

### Finance Member

**Home:** `/finance`
**Priority:** rejected submissions, own awaiting-review items, evidence gaps and the next legitimate submission action
**Primary navigation:** My finance work (`/finance`); Rent; Expenses; Owner balances; Leases; Ledger; Petty cash
**Account:** profile menu

The home is personally scoped by the server projection. It contains no disabled review controls and never infers ownership client-side.

### Operations Manager

**Home:** `/maintenance`
**Priority:** unassigned cases, overdue/blocked work, completion review and Finance handoffs for the manager's branch
**Primary navigation:** Cases; Assigned work; Recurring work; Inspections; Work orders
**Account:** profile menu

Navigation is an Operations workspace, not a single collapsed administrator Maintenance domain. Branch scope remains server-resolved.

### Operations Member

**Home:** `/tasks`
**Priority:** assigned work, due sequence, blockers and completion evidence
**Primary navigation:** My work
**Account:** profile menu

The compact sidebar is complete because it reflects a narrow job, not because administrator links were hidden. No filler destinations are added.

## Page anatomy and layout ownership

```text
AppShell
├─ adaptive role sidebar / mobile sheet
├─ global header: sidebar trigger · route breadcrumb portal · search · personal theme
└─ one scroll owner
   └─ WorkspacePage
      ├─ PageHeader: one H1 · compact context · one primary action
      ├─ optional local navigation and one controls row
      └─ page body
         ├─ queue/register/record/form/report content
         └─ attached state/pagination
```

- `AppShell` owns viewport height, the single vertical page scroll and mobile navigation overlay.
- `WorkspacePage` owns outer page gutters and width rules. Feature screens must not add a second outer gutter.
- `PageHeader` owns the one route H1. Feature section headings begin at H2.
- The header and body share the same logical left/right edges through `--workspace-gutter`.
- A register may own a local horizontal scroll region for semantic table columns, but the document never scrolls horizontally.
- Quick views are dialogs; there is no persistent side inspector or independent page-height scroll column.
- Pagination is attached to the register surface and uses the same edge.

## Page archetypes

1. **Queue home:** PageHeader -> non-zero attention links -> semantic queue -> secondary context. Mobile becomes a `<ul>` of task cards with the action visible.
2. **Register:** PageHeader -> one controls row -> table/list -> attached pagination -> optional quick view. Empty/error replaces rows but preserves header/controls.
3. **Record:** identity/status header -> 3–5 sibling local sections -> facts/actions -> evidence/history. Reading width is constrained; dense child registers can break to full width.
4. **Focused work:** PageHeader/breadcrumb -> constrained form/settings/report controls -> one save/action owner -> consequence/status region.

There are no arbitrary route-specific shells. A feature can compose within an archetype but cannot redefine the viewport/gutter/scroll contract.

## Content and disclosure system

The workspace uses operational language first. A person should understand the current fact, decision, consequence, and next action without knowing Nestory's schema, RPCs, projections, reconciliation model, or audit implementation.

Every route receives a content review covering its H1/H2 hierarchy, field and table labels, filters, actions, badges, helper text, empty/error/blocked/success states, confirmations, disclosures, and generated data labels. The review records one disposition for every issue: **remove**, **rename**, **shorten**, **preserve for safety**, or **move to technical details**.

The implemented route-by-route contract is `config/enterprise-frontend-content-review.json`, with the human-readable 47-route ledger in `docs/research/enterprise-frontend-redesign-research.md`. A route is not content-complete merely because it passes the automated phrase scanner: the manual record must also be present, passing, and synchronized with the executable route manifest.

### Default view versus technical details

The default task view may show record names, dates, amounts, statuses, evidence availability, affected scope, consequences, and actionable recovery. It must not expose raw UUIDs, hashes, fingerprints, input watermarks, machine status or remediation codes, JSON, database/source-table terms, allocation-set identifiers, or implementation commentary.

When an identifier or audit value is legitimately needed for support, investigation, export reconciliation, or traceability, place it in a collapsed disclosure named `Technical details` or `Audit details`. The disclosure:

- is closed by default;
- follows the plain-language status and recovery action;
- labels each value rather than dumping JSON;
- provides copy affordances where exact transfer is useful;
- does not become required reading for the ordinary workflow; and
- remains permission-scoped by the server.

### Vocabulary rules

| Avoid in ordinary task views | Prefer | Exception |
| --- | --- | --- |
| authority / authoritative | balance record, approved opening balance, current balance | Use authority only when distinguishing who may approve an irreversible financial decision. |
| roll-forward authority / persisted inputs | calculate month / recorded activity | Exact calculation provenance belongs in Audit details. |
| projection | current balance, expected rent, queue | Projection is allowed in a named analysis/report where forecast versus actual is the decision. |
| remediation / remediation code | needs attention plus the exact repair action | Machine code belongs in Technical details. |
| source fingerprint / roster hash / watermark | evidence recorded, ownership changed, calculation out of date | Exact hash/watermark belongs in Audit details. |
| allocation set / component movement | how the amount is shared / balance change | Exact ledger terminology may remain in exported audit evidence. |
| workflow / canonical / persisted | work, record, saved | Keep the technical term only in developer documentation. |

### Helper-text test

Helper text is included only when removing it would make a user more likely to make an error, misunderstand a material consequence, miss a permission boundary, fail to recover, or lose necessary accessibility context. Copy is removed when it restates the heading, visible fields, table columns, status badge, button label, or nearby data. Flavor text and explanations of implementation correctness are not interface content.

Financial safety is not an excuse for jargon. Transfers, reversals, close/publication, destructive actions, and corrections keep concise consequence text, affected scope, evidence requirement, and recovery/reversal path in plain language.

## Header, toolbar, filter and view rules

- PageHeader contains one title, optional compact scope/status, and one primary action. Long descriptions are reserved for risk, permission, accounting meaning or cross-team handoff.
- Local navigation appears as an underline rail only for sibling routes/sections. Five to seven items maximum on desktop and three to four visible before an overflow menu on mobile.
- A toolbar contains search, material filters, sort/view and export where relevant. It does not repeat the page action.
- Search submits with Enter; no icon-only submit is added unless search is otherwise non-submittable.
- Filter changes that apply immediately have no Done button. There is one clear/reset action.
- View switches preserve query scope and do not trigger success feedback.

## Lists, tables, records, timelines, forms and queues

### Tables/registers

- Use the source-owned shadcn Table primitives with a visible caption or accessible name.
- Headers use sentence case, tabular numbers align right, and sortable controls expose `aria-sort`.
- Rows always have a subtle hover state to aid scanning. Interaction is provided by a linked name/action, or by an explicitly selectable row with keyboard parity.
- Invariant columns and duplicated supporting labels are removed. Optional missing data is muted; warning color is reserved for work-blocking conditions.
- Mobile either keeps a deliberate local table scroller for comparison-heavy data or transforms to semantic list items when action and comprehension would otherwise be lost.

### Records/timelines

- Identity and status appear once in the header. Successful readiness checks are omitted; unresolved warnings appear as concise badges linked to their repair path.
- A timeline event presents event, actor, scope, exact time and source. Narrative text does not repeat structured fields.
- A record shows a short recent-history slice only when it helps the current decision, followed by `View records`.

### Forms

- Use Input, Label, Textarea, Select, Checkbox, Radio, Switch and date/time primitives for visible controls. Raw inputs remain only for hidden server-action values or semantics that the primitive cannot represent.
- Group fields by task and decision, not database table. Required/optional is programmatic and visible.
- Inline errors identify the field and recovery. A form-level live summary receives focus after failed submit when errors span multiple fields.
- Save/cancel stays in one DraftActionBar owner; route change is guarded while dirty.

### Queues

- Server projections own permission, scope, priority, status and money meaning. React never derives financial or authorization meaning from strings.
- Non-zero counts link to URL-backed queue scopes. An all-zero signal strip is omitted.
- A row contains enough to decide: task/record, context, age/due, amount where relevant, explicit status, next action.
- Loading does not reorder the queue; successful mutation removes/updates the row only after the server result is authoritative.

## Overlay and confirmation rules

| Need | Primitive/pattern | Rule |
| --- | --- | --- |
| Quick comparison context | `RecordQuickViewDialog` | Read-oriented; one canonical record link; no long multi-step form. |
| Focused create/edit/upload | `SideDrawer` or `Dialog` | Use drawer when record context remains useful; dialog/focused view when interruption must be prevented. |
| Destructive/irreversible decision | `AlertDialog` | Visible title, affected record/scope, consequence, safe cancel, explicit destructive verb. |
| Compact action list | `DropdownMenu` | Contextual actions only; visible labels; destructive item separated. |
| Select/filter choice | `Select` / `Popover` / searchable shared control | Correct listbox/combobox keyboard semantics; never a styled raw div menu. |
| Global search | `Dialog`-based command surface | Focus input first, trap focus, live result count, return focus. |

All overlays close with Escape where cancellation is safe, contain a visible close/cancel path, keep background inert, avoid nested overlays, restore focus and remain operable at a 320 CSS-pixel-wide reflow viewport.

## System-state rules

| State | Structure | Copy/action |
| --- | --- | --- |
| Loading | Archetype-matched Skeleton; `aria-busy` on named region | No indefinite spinner when layout is known. |
| True empty | EmptyState in the dominant surface | Title states the fact once. Offer the first legitimate action only. |
| Filtered empty | Preserve records scope/toolbar | Name current scope; one Clear filters action. |
| Error | Preserve orientation and unaffected controls | State operation that failed and safe retry/return. |
| Permission denied | No fake disabled workspace | State unavailable scope and legitimate destination/contact. |
| Typed blocker | Keep record visible | Concise prerequisite, authority/source and repair/drill-through. |
| Saving | Disable only affected action; maintain dimensions | Use the action's verb in progress feedback. |
| Success | Update authoritative context and polite live region | Use the completed verb; no celebratory modal. |
| Confirmation | Named dialog and consequence | Cancel plus exact action. |
| Destructive | Danger semantics plus text/icon | Target, scope, permanence/reversal path. |

## Visual system

### Typography

Geist Sans is the interface/display face; Geist Mono is reserved for identifiers, fixed-width timestamps and financial figures where column scanning benefits. No third font is introduced.

| Token | Size/line | Use |
| --- | --- | --- |
| `display` | 48/52 desktop, 36/40 mobile | Public hero only |
| `heading-1` | 20/28, semibold | Workspace route title |
| `heading-2` | 16/24, semibold | Major workspace section |
| `heading-3` | 14/20, semibold | Subsection/contained pattern |
| `body` | 14/20 | Default workspace copy/control |
| `body-compact` | 13/18 | Dense tables, secondary metadata |
| `label` | 12/16, medium | Field/table/status labels, sentence case |
| `data` | 13/18 mono/tabular | Amounts, compact identifiers, timestamps |

Arbitrary pixel type classes are removed from the workspace. Public typography may use the named scale rather than one-off sizes.

### Spacing and grid

- Base rhythm: 4px. Allowed working steps: 4, 8, 12, 16, 20, 24, 32, 40, 48.
- Page gutter: 16px below 640px; 24px from 640px; 32px from 1440px.
- Header vertical space: 16px mobile/desktop compact; 20px only for reading/focused pages.
- Control height: 36px compact, 40px touch-primary; icon targets never below 24x24 CSS pixels and normally 36x36.
- Dense register rows: 40–48px according to content; multiline rows are exceptional.
- Reading/form rail: 720–840px. Operational tables/queues use the available width.

### Palette and semantic tokens

Structural palette is neutral. Organization accent affects primary action, links, selected state, record spine and focus—not page backgrounds or semantic statuses.

| Role | Light | Dark |
| --- | --- | --- |
| Canvas | `#FFFFFF` | `#101313` |
| Secondary surface | `#F7F8F7` | `#151919` |
| Elevated/overlay | `#FFFFFF` | `#1B2020` |
| Primary text | `#171A19` | `#F1F4F2` |
| Secondary text | `#5E6763` | `#AEB7B3` |
| Border | `#DEE2E0` | `#343B3A` |
| Default accent seed | neutral `#171A19` | neutral `#F1F4F2` |
| Success | `#237A3E` | `#86D49B` |
| Warning | `#885817` | `#D6A85F` |
| Danger | `#B42318` | `#FF8A80` |

Each accent is contrast-corrected against the active canvas. Status backgrounds use low-chroma soft tokens; every status has text or icon meaning.

### Radius, border, shadow and elevation

- Radius: 6px controls and dense selections; 8px contained surfaces/overlays; full only avatars, pills and circular icon buttons.
- Borders: one-pixel separators for data structure and overlay boundary. Avoid nested bordered panels.
- Shadow: none for routine workspace structure; one restrained overlay shadow; public image/hero may use tonal layering rather than card shadows.
- Card is used only for self-contained settings previews, authentication form, or data that genuinely moves as one contained object.

### Interaction states

- Hover: subtle surface shift; never the only affordance.
- Focus: visible 2px ring with at least 3:1 state contrast and 2px offset where space permits.
- Selection: accent-soft fill plus record spine and `aria-selected`/current semantics.
- Pressed/open: one step stronger than hover.
- Disabled: opacity plus native/ARIA disabled semantics; permission-denied actions are normally omitted rather than disabled.
- Drag: no workflow relies on drag alone; equivalent buttons/actions exist.

### Density

- Tables: one line primary plus at most one short supporting line; 13–14px text; 40–48px rows.
- Forms: 12–16px field gaps inside a group, 24–32px between groups; helper text only for error prevention or consequence.
- Records: one identity/status header, concise definition-list facts, evidence/history separated by spacing before borders.

## Responsive transformations

| Component/workflow | Desktop | Tablet | Mobile / 200% equivalent |
| --- | --- | --- | --- |
| Role navigation | 256px collapsible sidebar; icon rail | Collapsed rail or sheet according to available width | Sheet opened by labelled trigger; current domain and role home first |
| Header | Single compact row | Actions may wrap once | Title/action stack; primary action remains visible; no clipped breadcrumb |
| Queue | Semantic table | Hide secondary columns | Semantic list cards with status/context/action visible |
| Comparison register | Full semantic table | Local horizontal region if meaning requires columns | Named local horizontal region with sticky identity, or semantic list when comparison is not essential |
| Record | Two-column facts only when scanning improves | One or two columns | One column; no side inspector; local navigation horizontally scrolls once at most |
| Form/settings | 720–840px rail | Same rail with fluid width | Full width; fixed action bars must not obscure focus |
| Dialog/drawer | Centered dialog or right drawer | Width limited to viewport | Near-full viewport sheet; content reflows at 320 CSS px; buttons stack if needed |
| Reports | Controls + wide source table | Controls wrap | Summary reflows; source table uses named local scroll; exports remain reachable |

At 200% zoom, the shell behaves as the corresponding narrower CSS viewport. Fixed/sticky chrome must not hide the focused control. The document never requires two-dimensional scrolling; only comparison tables may scroll horizontally inside a named region.

## Theme architecture

- Organization accent preset/custom seed remains Super-Admin-managed and server persisted.
- Organization mode remains a server-persisted **default** for first use.
- Every authenticated role receives a personal Light/System/Dark control in the shell. The selection is stored locally per organization and overrides the default on that browser only.
- One bootstrap script resolves personal preference -> organization default -> OS preference before paint, applies light/dark and organization accent tokens, and installs no competing boot script.
- Appearance preview never mutates the live document until saved. Saving an organization appearance update changes the shared accent/default, not other users' current personal override.
- Both themes are tested at every representative archetype and role home.

## Motion system

| Motion | Duration/easing | Purpose |
| --- | --- | --- |
| Hover/pressed/focus surface | 100–140ms standard | Reinforce affordance only |
| Sidebar/collapsible navigation | 160–180ms ease-out | Preserve domain continuity |
| Dialog/drawer/menu disclosure | 160–220ms ease-out | Clarify entry into temporary context |
| State replacement/feedback | 120–160ms opacity | Connect mutation result without delaying reuse |
| Public reveal | One restrained section/image sequence | Establish editorial rhythm after the existing hero |

No looping workspace motion, parallax, large page transforms or uniform stagger across routine elements. `prefers-reduced-motion: reduce` disables smooth scroll, translations, scales and nonessential transitions globally while preserving instant state change.

## Public landing architecture

The current hero's building-at-dusk concept, copy identity, entry actions and full-bleed composition remain. Execution improvements are limited to type scale, responsive crop, contrast, focus and reduced motion.

Post-hero sequence:

1. **The operating team:** one original editorial image of a property manager, maintenance coordinator and finance operator reviewing real building work at a practical shared table. Copy names the coordinated work, not lifestyle aspiration. The section remains understandable if the image fails.
2. **One operating record:** a cardless product-control composition showing how property, lease, cost, repair, document and history connect. One CTA.
3. **Request access:** one concise invite-only statement and request actions, followed by a restrained footer.

Remove the repeated photo mosaic, multi-row feature-card behavior, redundant proof metrics and duplicated request actions. The public surface uses the same Geist type, neutral palette and quiet forest accent as the product, with larger scale and editorial photography.

## Primitive-first implementation rules

- Inspect and reuse existing source-owned primitives before adding a package or wrapper.
- Button/Input/Label/Textarea/Select/Checkbox/Switch/Table/Tabs/Dialog/AlertDialog/Sheet/DropdownMenu/Popover/Tooltip/Badge/Skeleton/Separator and related controls are the default.
- Custom styles preserve the primitive's keyboard, focus, ARIA and dismissal semantics.
- Stable product compositions are allowed only when they own behavior: WorkspacePage owns page structure; RecordQuickViewDialog owns read-only record preview/focus return; DraftActionBar owns dirty-save actions; EmptyState owns empty/permission/error presentation.
- Wrapper-only aliases and stock shadcn example screens are prohibited.
- Superseded hand-rolled controls are removed only after consumers and tests migrate.

## Information discipline

- One fact, status, count or action is authoritative in the current context.
- Summaries exist only when they change a decision and link to canonical detail.
- Page title, breadcrumb, local navigation and sidebar do different jobs; none repeats a paragraph describing another.
- Successful readiness checks are silent. Only unresolved work is visible.
- Optional missing data is neutral; warnings identify actual risk/blocking.
- One primary action per page. Row/context actions do not also appear in the header unless they operate at page scope.
- Essential field labels, validation, consequences and accessible names are never removed for visual minimalism.
- User-facing copy names the property, person, lease, money, work, evidence, decision, or recovery—not the storage or calculation mechanism.
- Technical and audit metadata follows progressive disclosure and never competes with the primary task.
- Every route must pass the route-level content review; a clean copy-lint, screenshot, or axe result is necessary but not sufficient.

## Accessibility implementation contract

- Landmarks: skip link, labelled navigation, one main, named work regions and one route H1.
- Keyboard: all links, controls, sortable headers, menus, tabs, rows/quick views and workflows operate without pointer; visual order matches tab order.
- Focus: visible; never fully obscured; moves into overlays/error summaries; restores to the originating/next logical control after close or mutation.
- Names/relationships: visible labels, programmatic descriptions/errors, named tables/dialogs, correct heading hierarchy and live regions for async feedback.
- Contrast: WCAG 2.2 AA for text/non-text in both themes and every state; status never depends only on color.
- Targets: at least 24x24 CSS pixels or documented spacing/equivalent exception; common touch actions target 36–40px.
- Reflow: no lost content/functionality at 200% text resize and no document-level horizontal scroll; 320 CSS-pixel equivalent supported.
- Motion: complete reduced-motion behavior.
- Authentication does not introduce a cognitive function test and offers normal password-manager/paste behavior.

## Product-contract override

### Personal display mode, shared organization accent

1. **Existing constraint:** `PROJECT.md` states organization appearance is Super-Admin-managed and shared by every member; current code persists theme mode with the organization and only renders the shell toggle for Super Admin.
2. **Operational problem:** light/dark is a personal accessibility and environmental preference. A single operator toggling it changes everyone, while Finance and Operations users cannot select the theme they need.
3. **Evidence:** Vercel Geist recommends one canonical Light/System/Dark control and a root-level state source; WCAG requires equivalent contrast/reflow/focus acceptance in the presentation users actually operate.
4. **Affected scope:** all five roles and AppShell/ThemeRuntime/ThemeToggle/AppearanceEditor/Account behavior. Authorization, route access, organization accent, database finance/operations data and workflow permissions do not change.
5. **Safety:** Super Admin retains exclusive authority over organization accent and default. Personal mode is local presentation state only; it grants no capability and mutates no business data. Organization scoping is included in the preference key.
6. **Cohesive updates:** update `PROJECT.md`, theme runtime/toggle tests, shell role tests, appearance copy and browser light/dark acceptance. The existing organization `theme_mode` column remains the default; no migration or generated-type change is required.

### Routine Finance authority, exceptional Super Admin authority

1. **Existing constraint:** recurring rent/lease configuration and owner month-end completion were Super Admin-only even though Finance Manager already owned daily review, lock, reporting and corrective work.
2. **Operational problem:** routine Finance preparation reached a manager but still stopped at the administrator for rent setup, owner-opening review, month close and statement publication. The administrator became a daily and month-end bottleneck rather than an exception/governance role.
3. **Evidence:** the executable capability inventory, five-role browser fixtures and server actions show a coherent maker-checker boundary: Finance Member prepares, Finance Manager independently reviews/completes, and Super Admin retains governance and irreversible exception authority.
4. **Affected scope:** Finance Manager gains `/settings/rent-policy`, lease and rent-policy actions, owner-opening review, owner-month close and owner-statement publication. Finance Member and Operations scopes do not broaden. The database migration replaces the same checked predicates used by the existing RPCs; it does not bypass organization scope, readiness, lock, idempotency, immutable evidence or maker-checker rules.
5. **Safety:** Super Admin remains the only role for organization/access/branch and portfolio master setup, final-admin protection, approved-expense reversal, closed-month reopen and incomplete-publication recovery. Private capability helpers remain non-executable by `anon`, `authenticated` and `service_role`; public checked RPCs are the application boundary.
6. **Cohesive updates:** update `PROJECT.md`, explicit role navigation, route coverage/discoverability, capability contexts, server actions, SQL predicates, migration replay, pgTAP, unit contracts and five-role browser acceptance.

No other `PROJECT.md` or backend product contract is overridden. Route, workflow, database, security, financial, audit and traceability behavior remain authoritative and must migrate intact.

## Verification architecture

- The machine-readable acceptance matrix expands the executable manifest into route × role × state expectations and adds workflow, breakpoint, theme, keyboard, focus, semantics, zoom/reflow, reduced-motion, landing-image, and route-level content-review cases.
- Unit/component tests prove explicit role navigation composition, theme ownership/bootstrap, page heading/gutter ownership, shared table/form/state/overlay behavior and public-image fallback semantics.
- Static gates prove manifest/source synchronization, prohibited-copy rules, primitive/theme/layout policy and route discoverability. Human content review still verifies contextual jargon, repetition, flavor text, disclosure quality and preserved safety copy.
- Local browser verification uses only the disposable five-role fixture and local Supabase/app. It captures required desktop/tablet/mobile/light/dark/zoom and representative role/state artifacts.
- Final evidence records environment, branch, SHA, fixture target, exact commands/results, artifact paths and limitations. Passing static tests never substitutes for browser or accessibility acceptance.
