# Operational UI Handoff

Read this doc for authenticated UI work only. Do not load it for backend,
deployment, or schema-only tasks.

Use this handoff when continuing authenticated Nestory UI polish. It captures the current Properties and Units direction so future sessions can apply the same system to Timeline, Ledger, detail pages, and planned modules without rediscovering the decisions.

For durable product and engineering guardrails, start with `PROJECT_RULES.md`.
For dated current implementation and environment notes, see
`docs/project-state.md`.

## Current Direction

- Nestory should read as a quiet operational Property Management System, not a loud marketing app or generic record keeper.
- Authenticated pages should stay white, neutral, dense, and work-focused.
- Use minimal accent color, no teal-heavy controls, no oversized decorative cards, and no marketing-style dashboard sections.
- Primary list pages should optimize for scanning, selection, and repeated operator work.
- Overview is not a primary list page. Treat it as the portfolio decision dashboard: stronger visual hierarchy is allowed when it helps the operator see what needs attention first.

## Overview Dashboard Pattern

- Overview should answer "what needs attention and why?" before it offers record navigation.
- Use one clear portfolio summary, four or fewer primary KPI cards, and no more than three chart views on the first dashboard pass.
- Keep the chart set purposeful: property comparison, cash trend, and lease runway are the current recommended views.
- Use color as an alert and grouping cue, not decoration. Neutral UI should carry the page; warning, danger, and success should only signal status.
- Keep exact rows, CRUD forms, and long audit detail in the module pages. Overview should link into Units, Leases, People, Ledger, and Timeline rather than becoming another table surface.
- Remove broad portfolio snapshot panels from Timeline and Ledger once Overview carries that summary layer. Those pages should focus on their own records and inspectors.

## List Page Pattern

- Use a compact header, compact filter bar, table or card selector when both modes are useful, and a docked inspector on wide desktop.
- Treat tables and cards as selection surfaces. They should not repeat every detail from the inspector.
- Keep the docked inspector responsible for richer context: latest record, ledger net, linked actions, and secondary operational detail.
- Use icon-first controls for familiar actions, with accessible labels and titles.
- Keep filters around 32px high, with `Filters` wording, icon-only search/reset where practical, and advanced filters collapsed unless active.
- Use URL-backed filters and pagination for large operational lists.

## Table Rules

- Table body should be about 13px and table headers about 11px with zero letter spacing.
- Rows should be dense but readable; the current Properties and Units target is roughly 55px row height.
- Column widths should follow scan value, not equal width. Short fields such as status, unit count, floor, and actions should stay compact.
- Money cells should be prominent, tabular, right-aligned, and symbol-first. Keep secondary currency muted.
- Action columns should be compact, icon-only, and stable so row actions do not crowd numeric values.
- Avoid page-level horizontal overflow. Dense tables may scroll inside their own table container only when truly necessary.

## Card Rules

- Cards are an alternate selection view, especially useful when property or unit photos are available.
- The card photo area must be photo-ready: use a stable aspect ratio, currently `4:3` for Units, and keep all readable text outside the photo.
- Do not place unit names, property names, badges, rent, or other required text on top of real photos. Photo contrast will be unpredictable.
- Put title, status, property code/name, rent, floor, and lease summary on the white content area below the image.
- Keep card information intentionally lighter than the inspector. Cards help the user pick a record; the inspector explains it.
- On mobile, use the card/list stack directly and hide desktop-only Table/Cards controls when the alternate mode is not actually available.

## Inspector Rules

- Docked inspectors should stay around 300px to 320px on wide desktop unless content proves it needs more.
- Keep inspector actions compact and icon-first.
- Use the inspector to show information removed from list rows: latest timeline record, ledger net, relationship context, and linked navigation.
- The inspector should complete the selected row, not duplicate the row.

## Completed Reference Surfaces

- Properties is the reference for compact filters, Table/Cards toggle, table density, money cells, icon-only actions, and docked inspector behavior.
- Units now follows the same pattern:
  - Table mode is a compact selector and no longer repeats latest-record or ledger details.
  - Card mode uses a text-free `4:3` photo slot and keeps readable text below the image.
  - Mobile uses cards directly and hides the desktop view toggle.
  - The right inspector carries ledger net, latest record, and linked actions.

## Next Application Order

1. Timeline
2. Ledger
3. Unit detail
4. Settings
5. Documents
6. Reports
7. Planned placeholder pages

For Timeline and Ledger, move the primary table earlier, keep summary and recent-change panels secondary, compact filters and table rows, and use the inspector for detail context instead of repeating that context in every row.
