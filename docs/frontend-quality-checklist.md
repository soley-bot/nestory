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

## Shared Workspace Anatomy

- Keep a compact title and one instinctive primary action at the top.
- Keep filters/search/view state URL-backed in the workspace tools zone.
- Use the shared record surface and responsive inspector; open the inspector as
  a focus-managed drawer when there is not enough width for a useful split view.
- Use the shared side drawer for create, edit, archive, restore, upload, and
  other focused record work.
- Settings pages keep local navigation, active workspace, and draft actions as
  three distinct zones with one save/discard/status model.

## Accessibility And Recovery

- Brevity must preserve accessibility: form controls keep visible labels,
  keyboard-only interactions keep instructions, and icon-only actions keep
  accessible names for screen readers.
- Keep heading levels in document order, mark the current global and local
  destination with `aria-current`, and announce loading, errors, and success.
- Each drawer should have one announced close button.
- Dialogs and drawers must trap focus, close with Escape, and return focus to
  the control that opened them.
- Focus, keyboard submit, and disabled states must work at 200% zoom and at
  1440x900, 1024x768, and 390x844 without document-level horizontal overflow.
- Empty, loading, error, blocked, and success states should be visible and
  specific to the operator task.

## Verification

- Add a focused browser smoke for create/edit/archive/restore drawer changes.
- Prefer no-mutation smokes unless the test also owns cleanup.
- Run `npm run test:ui-a11y` against a local fixture workspace. It rejects
  serious or critical axe findings, uncaught browser errors, horizontal
  overflow, and routes without a reachable action. Any third-party exception
  must name the exact rule, route, reason, and owner.
- Run `npm run test:ui-coverage`; every filesystem page must have roles, states,
  a concrete smoke path, query/redirect behavior, workflow evidence, and one
  generated evidence row.
- For platform-wide changes, run the read-only redesign and accessibility
  sweeps against the built app, plus `test:properties-flow` and
  `test:maintenance-mobile` for their owned interaction contracts.
- Run lint and type checks for changed files, then expand to build when route,
  auth, schema, or shared UI behavior changed.
