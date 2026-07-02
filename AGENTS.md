<!-- BEGIN:nextjs-agent-rules -->
# Next.js Version Rule

This repo uses Next.js 16.2.9 with App Router and newer conventions. Before
editing framework behavior, read the relevant guide in
`node_modules/next/dist/docs/` instead of relying on older Next.js memory.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:nestory-context-rules -->
# Nestory Context Rule

Read `PROJECT_RULES.md` first. Then load only the doc needed for the task:

- `docs/current-state.md` for implemented routes, modules, schema, and known
  placeholders.
- `docs/engineering-rules.md` for data, auth, write-boundary, UI, and file
  organization rules.
- `docs/verification.md` for local checks, build checks, Supabase checks, and
  handoff expectations.

These docs describe the current implemented product. Do not restart from old
starter-build or roadmap assumptions unless the user explicitly asks.
<!-- END:nestory-context-rules -->
