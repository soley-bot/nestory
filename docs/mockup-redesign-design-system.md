# Nestory Mockup Redesign System

This document translates the supplied desktop dashboard and mobile mockups into
an app-wide styling and branding guide. Use it when redesigning authenticated
Nestory pages and the public/auth entry screens.

The goal is not loose inspiration. The goal is a screenshot-faithful Nestory UI
that looks like the supplied mockups, then adapts that same system across every
page without changing the product flow.

Pixel-perfect matching requires the original design source file. Without it,
implementation should use the screenshots as the visual source of truth and
verify by browser screenshots at desktop and mobile sizes.

## Exact Match Rule

- Match the mockups first; do not reinterpret the brand direction.
- Keep the same white workspace, navy text, blue accents, rounded cards, thin
  borders, soft shadows, and generous dashboard spacing.
- Dashboard should look like Image 1.
- Mobile landing, dashboard, property detail, and unit timeline should look
  like Image 2.
- If a choice is unclear, choose the option that makes the app closer to the
  screenshots, not closer to the current app.
- New pages should reuse the same proportions and components instead of
  inventing page-specific visual styles.

## Brand Feel

- Clear, premium, and trustworthy.
- White workspace with navy text and disciplined blue accents.
- Rounded, soft, but not playful.
- Data first, decoration second.
- Mobile should feel like a native property management app, not a squeezed
  desktop page.

## Design Tokens

Use these tokens to match the screenshots.

| Token | Hex | Use |
| --- | --- | --- |
| `navy-950` | `#071432` | Brand mark, primary text, dark mobile KPI card |
| `navy-800` | `#10234f` | Secondary dark surfaces, active mobile nav |
| `blue-600` | `#2563eb` | Primary actions, selected nav, chart income |
| `blue-100` | `#eaf1ff` | Active nav background, soft icon tiles |
| `slate-700` | `#344563` | Secondary labels and body text |
| `slate-500` | `#69758c` | Muted helper text |
| `slate-200` | `#dfe5ee` | Borders and dividers |
| `slate-100` | `#f4f7fb` | App background and section wash |
| `white` | `#ffffff` | Cards, panels, inputs |
| `green-600` | `#16a05d` | Positive deltas and completed states |
| `green-100` | `#e7f8ef` | Positive badges |
| `red-500` | `#ef4444` | Urgent counts, overdue, negative deltas |
| `amber-500` | `#f59e0b` | Payments, warnings, lease runway |
| `purple-500` | `#8b5cf6` | Documents, lease events, secondary grouping |

Do not make the whole app blue. The screenshots are mostly white and navy; blue
is the action, selection, and chart accent.

## Typography

Use a system font stack first. The mockup reads like a clean modern system UI,
not a decorative custom-font brand.

- Font family: `-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif`
- Display page title: 28px desktop, 22px mobile, 700 weight, 1.2 line-height
- Section heading: 16px desktop, 15px mobile, 700 weight
- Card title: 14px, 600 weight
- Body text: 13px desktop, 14px mobile
- Helper text: 12px
- Table header: 11px, 600 weight, no letter spacing
- KPI number: 24px desktop, 22px mobile, 700 weight, tabular numbers
- Dense table body: 13px

Use sentence case for UI copy. Avoid uppercase except tiny metadata labels.

## Layout System

### Desktop Shell

- Fixed left sidebar: 280px target width, matching Image 1.
- Main content max width: none for dashboards and tables; constrain inner
  content with padding instead.
- Page padding: 44px left/right on large desktop dashboard, 24px tablet, 16px
  mobile.
- Top utility area: search centered/right, notification icon, period selector.
- Sidebar groups:
  - Main navigation.
  - Shortcuts.
  - User/profile footer.
- Active nav item: blue text on `blue-100`, 8px radius, icon plus label.
- Sidebar background: white with right border.
- Brand mark and `Nestory` wordmark sit at the top like Image 1.
- User profile sits at the bottom like Image 1.

### Dashboard Layout

Desktop dashboard must follow Image 1:

```text
sidebar | top search/actions
        | greeting + period filter
        | horizontal KPI strip
        | 3-column dashboard grid
        | lower chart/action grid
```

Rules:

- KPI strip uses one shared card, divided into five equal cells on desktop.
- First row panels: portfolio overview, cash flow, recent activity.
- Second row panels: occupancy by property, lease endings, quick actions.
- Cards use 8px radius, 1px border, subtle shadow.
- Dashboard card gap: 24px desktop.
- Header greeting starts near the upper left of content, not inside a card.
- Period filter sits on the right under the search row.
- KPI icons use soft circular color wells.
- Charts should be simple CSS/SVG first; add a chart dependency only if the
  current hand-built charts become limiting.

### Record Pages

Record pages should copy the mobile/detail language in Image 2, not the
dashboard grid. They should use:

- Compact page header with title, status, primary action.
- Sticky tab row for Overview, Timeline, Ledger/Finances, Documents/Files.
- Primary record summary near the top.
- Detail cards below, not giant hero sections.
- Timeline as the north-star view for unit/property detail pages.

### Mobile Layout

Mobile must follow Image 2:

- App frame width target: 390px.
- Page padding: 20px.
- Top bar height: 56px.
- Bottom nav height: 64px plus safe area.
- Bottom nav items: Home, Properties, Units, Leases, More.
- Use tab rows for detail pages.
- Use cards instead of dense tables below 768px.
- Primary actions are full-width or right-aligned compact buttons depending on
  the page.
- Avoid horizontal scrolling on mobile except for tabs.
- Mobile dashboard first card is dark navy with four KPI cells, matching Image
  2.
- Mobile detail pages use a back arrow, title block, three-dot action, tabs,
  and stacked white cards.
- Unit timeline uses a vertical navy timeline line with event cards on the
  right, matching Image 2.

## Components

### Cards

- Radius: 8px desktop cards, 10-12px mobile cards where the mockup uses softer
  phone UI.
- Border: `1px solid slate-200`.
- Background: white.
- Shadow: very subtle, never heavy.
- Padding: 20px dashboard cards, 16px operational cards, 12px dense table
  companions.

### KPI Cards

- Icon tile: 48px desktop, 40px mobile.
- Icon size: 20px desktop, 18px mobile.
- KPI label: 12px muted.
- KPI value: 22-24px, tabular.
- Delta: 12px, green/red with arrow icon.
- Desktop KPI strip uses five cells like Image 1.
- Mobile dashboard KPI card uses dark navy background and a 2-by-2 grid like
  Image 2.

### Buttons

- Primary: navy background, white text, 8px radius.
- Secondary: white background, slate border, navy text.
- Icon buttons: square 36px desktop, 40px mobile.
- Use lucide icons. Do not add another icon package.
- Buttons need visible focus states.

### Badges

- Radius: 6px.
- Height: 22px.
- Text: 11-12px, 600 weight.
- Use badges only for status, count, or urgency.

### Tables

- Keep table rows around 52-56px.
- Header text 11px.
- Body text 13px.
- Money right-aligned and tabular.
- Row click opens preview; linked name opens full record.
- Mobile switches to cards.

### Charts

- Bar charts use blue for income and slate for expense.
- Donut charts use blue, red, amber, purple, and slate only when each segment
  carries meaning.
- Always show labels or a clear legend.
- No decorative charts without a decision purpose.
- Bar thickness, spacing, and rounded tops should match Image 1/Image 2.
- Donut thickness and center label should match Image 1 lease endings and Image
  2 occupancy.

## Screenshot-Specific Targets

### Image 1 Desktop Dashboard

- White 280px sidebar, Nestory logo at top, user card at bottom.
- Top row search input near the right, notification icon at far right.
- Greeting block: `Good morning, Alex` style headline and muted subtitle.
- Period selector: pill button on the right.
- KPI strip: one wide card split into five KPI cells.
- Dashboard grid:
  - Portfolio overview, cash flow, recent activity.
  - Occupancy by property, lease endings, quick actions.
- Card borders are visible but light.
- Shadows are soft and low contrast.

### Image 2 Mobile

- Mobile public entry screen has centered logo, large Nestory wordmark,
  short tagline, minimal illustration, primary full-width button, and secondary
  sign-in link.
- Mobile dashboard has:
  - Top bar with menu, Nestory title, notification icon.
  - Greeting text.
  - Dark navy portfolio card with four KPI cells.
  - `At a glance` card grid.
  - Recent activity list.
  - Bottom nav.
- Mobile property detail has:
  - Back arrow, title/subtitle, three-dot action.
  - Tab row.
  - Occupancy card with donut chart.
  - Net income chart card.
  - Property info card.
  - Full-width timeline button.
- Mobile unit timeline has:
  - Back arrow, title/subtitle, three-dot action.
  - Tab row with Timeline selected.
  - Filter pill and navy add button.
  - Vertical timeline with dated event cards.

## Icon Direction

Use lucide-react icons already in the project.

| Area | Icon |
| --- | --- |
| Home/Dashboard | `Home` or `BarChart3` |
| Properties | `Building2` |
| Units | `Building` or `Home` |
| Leases | `ScrollText` or `FileText` |
| People | `Users` |
| Transactions/Ledger | `Landmark` or `CircleDollarSign` |
| Payments | `CircleDollarSign` |
| Maintenance | `Wrench` |
| Tasks | `ClipboardList` |
| Documents | `FolderOpen` |
| Reports | `FileText` or `BarChart3` |
| Import | `Upload` |
| Settings | `Settings` |
| Search | `Search` |
| Notifications | `Bell` |
| Calendar/Period | `Calendar` |
| Add | `Plus` |
| More | `MoreHorizontal` |

## Motion And Interaction

- Hover background changes only; avoid bouncing or scaling panels.
- Use short transitions: 120-180ms.
- Drawers slide in from the right on desktop and bottom/full screen on mobile.
- Respect reduced motion.
- Keep keyboard focus visible.

## Redesign Order

Redesign in this order so the new system lands without rewriting everything at
once:

1. Global shell: desktop sidebar, mobile top bar, bottom nav.
2. Overview dashboard.
3. Unit detail page: mobile-first tabs and timeline cards.
4. Property detail page.
5. Units list.
6. Properties list.
7. Leases.
8. People and Tenants.
9. Maintenance.
10. Ledger and Payments.
11. Timeline.
12. Documents.
13. Reports.
14. Import data.
15. Settings.
16. Login, signup, setup, and public landing.

## Pages To Redesign

### Public And Auth

- `/`
- `/login`
- `/signup`
- `/setup`

### Core Dashboard

- `/overview`

### Properties And Units

- `/properties`
- `/properties/[propertyId]`
- `/units`
- `/units/[unitId]`

### People And Leasing

- `/people`
- `/tenants`
- `/leases`

### Money

- `/ledger`
- `/payments`

### Operations

- `/maintenance`
- `/timeline`

### Evidence And Outputs

- `/documents`
- `/reports`
- `/import`

### Admin

- `/settings`

## Implementation Boundaries

- Reuse the current data loaders and feature modules.
- Reuse lucide icons.
- Reuse existing Radix controls.
- Do not add a chart library for the first redesign pass.
- Do not redesign every page in one pull. Ship one page family at a time.
- Keep the dashboard visually rich, but keep operational list pages dense and
  practical.

Skipped: full visual token abstraction. Add it only after two or three pages
prove the tokens need centralizing.
