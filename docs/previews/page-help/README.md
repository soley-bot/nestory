# Page help previews

These screenshots show the actual shared AppShell, PageHeader, and PageHelp components in a local preview using synthetic records. No customer data or connected database was used. The Next.js development indicator was hidden for capture.

| Desktop, 1440 × 900 | Mobile, 390 × 844 |
| --- | --- |
| ![Desktop help panel](desktop.png) | ![Mobile help sheet](mobile.png) |
| ![Desktop header with help closed](desktop-closed.png) | ![Mobile header with help closed](mobile-closed.png) |

Browser checks passed at both sizes: three steps, dialog labeling, keyboard focus containment, Escape dismissal, focus return, preserved form values, URL filters and application scroll position, no horizontal overflow, a 44px close control, and zero axe violations within the help dialog. Lease help switches to deposit guidance without navigating; a subsequent Units page opens Units guidance.

Validation passed: 111 tests across help, shared layout/navigation, permission navigation, settings tabs, and dashboard suites; the final header adjustment passed another focused run of 49 tests. TypeScript noEmit, repository ESLint excluding the ignored generated preview output, affected-file ESLint, UI copy verification, secret scan, and whitespace review passed.

Not run: full application production build, full repository test matrix, authenticated hosted browser checks, and database tests. This change has no database, permission, accounting, or customer-record writes. Report detail guidance remains for the reporting owner through the documented component API.
