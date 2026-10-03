# Import results and document recovery

Synthetic presentation studies captured before the application edits. These images use fictional files and records. They are representative copy/layout previews, not authenticated screenshots of the application. `index.html?version=before` and `index.html?version=after` allow comparison. No controls connect to an API.

Application scope: import result labels, separate save counts, original blocked-row count, staged/committing/terminal correction guidance, diagnostic download explanation, and document archive/restore discoverability. Existing action APIs, permissions, staging, duplicate protection, finance mutations and approval behavior remain intact.

Base: `9b9d7a86a7937d3eff0cd7e84611eaebe2cba04a`. Branch: `codex/import-results-document-recovery`.

Library images:

| Image | Library ID |
| --- | --- |
| Before desktop | `libfile_e561f561d4a48191b1a86deb42384f36` |
| After desktop | `libfile_163862b5a890819190202355ebe07685` |
| Before mobile | `libfile_6fa1eabafdac8191abd348a3532a3154` |
| After mobile | `libfile_a1c8cc0424108191b265b006670c58c7` |

Validation: 57 focused unit/UI/action tests passed across import-result presentation, import preview, import actions, document screen and document actions. Includes partial results, staged/all-blocked/loading/terminal guidance, guarded resume/reconcile, CSV diagnostics, permission checks, empty-list recovery guidance, keyboard quick view and restore cancel. Changed-file ESLint and TypeScript passed. No real imports, archive writes, restores, deletions, merge or deployment were performed. Production build result is recorded in the handoff.

Parent review is pending. Coordinator `01a0f1c6` should keep this branch separate from forms/history worker and settings work. This environment has no callable cross-thread messaging tool; the parent handoff is the coordination channel.

The Library metadata helper cannot apply Unix extended attributes on Windows; durable Library IDs are recorded here and in the workspace handoff instead.
