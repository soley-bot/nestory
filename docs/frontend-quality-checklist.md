# Frontend Quality Checklist

Use this for authenticated operational screens before calling a flow ready.

## Flow State

- Model create, edit, archive, restore, upload, and import flows as visible
  states: idle, pending, success, error, blocked.
- Show blocked states before submit when the rule is knowable from loaded data.
- Success states should offer the next operational action, not just a toast.

## Actions And Copy

- **Label the action; explain only risk, consequence, permission, unfamiliar
  domain meaning, or handoff.**
- Action labels must open the exact workflow they name.
- Destructive or lifecycle actions need a record summary, consequence, and
  confirm/blocked state.
- Prefer concrete next steps such as Open record, Add units, Upload photo, or
  Review active units.
- `npm run test:ui-copy` scans `src/app`, `src/components`, and `src/features`.
  Its sole exclusion is `src/features/marketing/`, the public landing surface;
  do not broaden that exclusion without reviewing the guard.

## Forms

- Keep server action validation as the source of truth.
- Mirror simple server constraints with native inputs: required, maxLength,
  accepted file types, and date controls.
- Explain fields that have a backend meaning operators may not guess.

## Operational Review

- Add URL-backed review filters for common cleanup queues.
- Review filters should explain why the records are shown and the next action.
- Keep first screens sparse; push full history into detail records.

## Accessibility And Recovery

- Brevity must preserve accessibility: form controls keep visible labels,
  keyboard-only interactions keep instructions, and icon-only actions keep
  accessible names for screen readers.
- Each drawer should have one announced close button.
- Focus, Escape, keyboard submit, and disabled states must work.
- Empty, loading, error, blocked, and success states should be visible and
  specific to the operator task.

## Verification

- Add a focused browser smoke for create/edit/archive/restore drawer changes.
- Prefer no-mutation smokes unless the test also owns cleanup.
- Run lint and type checks for changed files, then expand to build when route,
  auth, schema, or shared UI behavior changed.
