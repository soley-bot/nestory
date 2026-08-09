# Desktop Domain Navigation Design

## Goal

Make deeper Finance, Maintenance, and Records pages discoverable from the desktop sidebar without duplicating the same cross-page navigation inside every page.

The change is intentionally desktop-only. Mobile keeps its current page-level workspace navigation until a separate mobile navigation pass is designed and tested.

## Navigation Model

The sidebar distinguishes between two kinds of destinations:

- Single destinations, such as Overview, Properties, People, Reports, and Settings, remain direct links.
- Multi-page domains, Finance, Maintenance, and Records, become expandable groups on desktop.

Expanding a domain reveals its authorized pages:

- Finance: Finance work, Rent, Expenses, Owner balances, Leases, Ledger, and Petty cash.
- Maintenance: Cases, My work, Recurring work, Inspections, and Work orders.
- Records: Timeline history, Property timeline, Maintenance timeline, Financial timeline, Documents, and Import.

The active domain expands automatically. Users can expand or collapse inactive domains. The active child receives the current-page treatment, while the parent receives the active-domain treatment.

Role filtering remains authoritative. Finance roles see only the complete Finance group. Operations Managers see the complete Maintenance group. Operations Members see Maintenance with My work as their only child destination. Super Admin sees every group and its complete destination set.

## Page-Level Navigation Boundary

On desktop, the cross-page Finance navigation row and Maintenance workspace selector are hidden because those routes are available in the sidebar.

On mobile, those controls remain visible. This preserves the existing mobile navigation path and avoids expanding the scope into a mobile-sidebar redesign.

True within-page controls remain unchanged. Examples include expense review statuses, owner-versus-tenant balance views, maintenance review filters, list/card switches, and property-detail tabs. These controls change the current page's data or presentation rather than navigating to another workspace page.

Records pages do not gain a second local cross-page control. Their scope continues to be communicated by each page title and context while the desktop sidebar supplies cross-page navigation.

## Interaction and Accessibility

- Domain toggles use native buttons with `aria-expanded` and an accessible group label.
- Child destinations remain ordinary links and preserve browser navigation behavior.
- Keyboard users can tab to a domain toggle, expand it with Enter or Space, and then reach each child link.
- In collapsed icon-only sidebar mode, child lists are hidden and each domain icon links directly to that role's domain landing page. Its tooltip names the domain.
- Active states are derived from route matching, including detail routes.
- Motion is limited to the existing collapsible transition and respects the shared component behavior.

## Component Boundary

`AppShell` owns the role-aware domain definitions and renders desktop domain groups. The definitions keep parent route matching and child destinations together so the sidebar cannot drift from its active-route logic.

The existing Finance and Maintenance local-navigation components remain as mobile fallbacks, but their outer navigation elements become hidden at the desktop breakpoint. No finance, maintenance, or records data flow changes are required.

## Verification

Automated tests will verify:

- Super Admin receives all three expandable domain groups and their child links.
- Finance roles receive only the Finance group.
- Operations roles receive the correct Maintenance children.
- The current domain and child route are marked active and the domain starts expanded.
- Finance and Maintenance cross-page local navigation is hidden on desktop and retained on mobile.
- Genuine within-page tabs and filters remain rendered.

Desktop browser verification will cover expanded and collapsed sidebar states on representative Finance, Maintenance, and Records routes. Mobile will receive a regression smoke check only; its layout will not be redesigned in this pass.

## Out of Scope

- Mobile sidebar information architecture.
- Changes to authorization or route guards.
- New routes or renamed routes.
- Redesigning within-page tabs, status filters, tables, or drawers.
- Fixing unrelated hidden-page data or activity-link findings from the prior audit.
