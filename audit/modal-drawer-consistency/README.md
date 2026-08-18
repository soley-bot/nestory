# Modal and drawer consistency audit

## Scope

Primary property-management workflow surfaces: Property, Unit, Person, Lease, Rent, and Finance.

## Interaction rule

- Use a modal for a short decision, confirmation, or tightly scoped action.
- Use a drawer for a create/edit form or record preview that needs context, scrolling, or follow-up actions.
- A drawer must always render a useful summary, form, empty state, or recovery action.

## Captured steps

1. `01-property-record.png` — healthy baseline record page.
2. `02-property-edit-modal.png` — healthy wide edit drawer with persistent actions; filename preserves the original audit label.
3. `03-unit-edit-drawer.png` — fixed: Unit edit now matches the Property edit drawer pattern.
4. `04-invoice-detail-drawer.png` — fixed: invoice detail is now a contextual drawer while payment remains a focused modal.

## Findings and changes

- Unit and Person edit forms were inconsistent with Property and Lease editing because they used large centered modals. They now use wide drawers.
- Finance invoice, paid-cost, and owner-balance record details overloaded centered modals. They now use drawers; payment, review, reversal, and confirmation actions remain modals.
- Unit lease preview had a nullable branch that could produce an empty drawer under stale state. It now renders a clear no-current-lease recovery message.
- Archive and restore prompts remain compact modals because they are short, consequential decisions.

## Accessibility notes

- Captured drawers expose labelled dialogs, a named close control, scroll-contained content, and persistent form actions.
- Keyboard focus restoration and dirty-form dismissal are provided by the shared drawer component.
- Screenshot evidence cannot establish full keyboard order, screen-reader announcements, or contrast compliance; automated and keyboard checks remain separate verification steps.
