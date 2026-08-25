# Layer 2 Lease Guided Resolution Design

**Status:** Approved visual direction, translated from the refined third mockup

**Approved source:** `C:\Users\USer\.codex\generated_images\01a03438-616d-7b23-bd59-3dc08e9d565e\exec-d33fbee3-2b25-4036-9541-f18208a26654.png`

## Goal

Make a Lease record explain its one current priority and guide the operator through the next safe action without exposing Nestory's database or accounting implementation.

The first Layer 2 pilot is the Lease payment-resolution state shown in the approved mockup. Unit, Property, and Person record pages follow only after this pilot is browser-reviewed.

## Design Decisions Already Approved

- Use the refined third mockup's guided-resolution composition.
- Keep the Nestory shell, breadcrumb, Lease identity, status, and restrained neutral visual system.
- Keep exactly one dominant action.
- Show a short progress line for the active resolution.
- Use a wide action column and a narrow Lease-context column separated by one divider.
- Rename `Recent evidence` to `Recent activity`.
- Do not use `evidence` as an ordinary user-facing section or action label.
- Show the deposit amount as well as its received state.
- Include one compact `Upcoming` section from the second mockup.
- Use flat sections and dividers rather than a card grid.

## Record And Action Relationship

The canonical Lease URL remains stable:

```text
/leases/[leaseId]
```

Its default state remains the Lease record. A focused payment resolution is opened within that record context through URL-backed action state:

```text
/leases/[leaseId]?action=record-payment&invoiceId=[invoiceId]
```

This keeps bookmarks, refreshes, browser navigation, and return behavior predictable. It also avoids replacing the Lease record with a role-specific Finance page.

The focused state uses the approved no-tabs composition because the operator is completing one action. `Open full lease record` clears the focused action parameters and returns to the same Lease record. Completing the action does the same after the server result is authoritative.

## Focused Page Anatomy

### Header

- Breadcrumb retains Property, Unit where available, and Lease identity.
- Title uses the existing Lease identity: tenant and unit.
- Status appears once beside the title.
- Supporting line shows Property and Lease dates.
- `More` is the only header control in the focused state.

### Resolution heading

The heading names the exact exception, for example:

```text
Resolve outstanding rent
USD 258.00 was due today for August rent.
```

Copy is derived from the selected invoice. It must not infer urgency from strings in the browser.

### Progress line

For an IPS-collected tenant invoice, the three stages are:

1. Invoice reviewed — complete when the focused invoice is valid and payable.
2. Record payment — current while payment is outstanding.
3. Receipt created — future until a payment succeeds and receipt publication completes.

The progress line is explanatory state, not a workflow engine. It contains no independent persistence or client-derived financial meaning.

### Payment to record

The wide column reuses the existing tenant-invoice payment authority and contains:

- Invoice number
- Amount due
- Due date
- Tenant
- Payment date
- Receiving account
- Optional reference
- One primary `Record [amount] payment` action
- One quiet `Payment is not received` return path

The approved mockup's `Payment method` control maps to Nestory's existing receiving-account choice. The implementation should use the clearer label `Deposit to`, already used by the authoritative payment form, unless the selected account model genuinely exposes a payment-method field.

Allocation controls remain collapsed and appear only when an invoice has multiple outstanding lines. Existing validation, idempotency, receipt creation, error messages, and permission checks are preserved.

### Lease context

The narrow column shows only context needed to verify the payment:

- Unit
- Monthly rent
- Deposit amount and received state
- Lease end date
- `Open full lease record`

Deposit presentation rules:

- Fully received: `USD 258.00` plus a small `Received` badge.
- Partly received: deposit amount plus plain text showing the amount received.
- Not received: deposit amount plus a neutral `Not received` state.
- No deposit required: `No deposit required`; do not show a received badge.

Deposit amount and received state come from the existing Lease deposit summary. They do not come from invoice settlement state.

### Recent activity

Show up to three concise, source-linked Lease activity rows. The focused payment invoice is allowed as the first row. Each row contains date, activity, record reference, and one `View` link when a legitimate destination exists.

The heading is always `Recent activity`. Ordinary page copy and actions do not use the term `evidence`.

### Upcoming

Show up to three dated items already owned by the Lease record or authoritative Finance projection. Initial sources, in priority order, are:

1. A server-provided next invoice due date when one exists.
2. A scheduled Lease activation or term change.
3. The Lease end date.

The UI does not manufacture a future rent date from a client-side calendar calculation. If there is no legitimate future item, omit the section rather than display an empty card.

## Data And Authority Boundaries

- `recordTenantInvoicePaymentAction` remains the payment mutation authority.
- The existing invoice, payment-allocation, reconciliation-source, receipt, and idempotency contracts remain unchanged.
- The Lease page receives only the selected payable invoice and receiving-account options required for this focused state. It must not load the entire Finance workspace merely to render one action.
- A focused Finance query may reuse the existing invoice mapping helpers, but it introduces no new database table, RPC, migration, enum, or financial classification.
- `collectionRoute === "through_ips"` uses the approved `Record payment` resolution.
- A direct-to-owner invoice is outside the initial guided-resolution pilot. It returns to the stable Lease summary with a link to the existing Finance `Confirm owner collection` action; it never pretends Nestory received cash.
- Permission and organization scope are resolved by the server. The browser does not derive access from role labels.

## Interaction And Return Flow

```text
Lease summary
  -> select outstanding invoice / payment action
  -> focused guided resolution at the same Lease URL
  -> authoritative payment action
  -> receipt publication result
  -> return to refreshed Lease summary
```

- Browser Back returns to the previous Lease or queue state.
- `Open full lease record` and `Payment is not received` clear only the focused action parameters.
- A successful payment refreshes Lease, Finance, Records, and receipt destinations through the existing server revalidation boundary.
- A failed payment keeps the focused form visible, preserves safe input, and moves focus to actionable error feedback.
- If receipt publication fails after payment succeeds, the payment remains successful and the UI states `Payment recorded. Receipt unavailable.` using the existing action result.

## Default And Exceptional States

- No payable invoice: render the stable Lease summary; do not show a disabled guided-resolution shell.
- Missing or stale invoice ID: return to the Lease summary with concise status feedback.
- Unauthorized payment action: show read-only invoice and Lease context with a legitimate Finance destination; do not render a fake disabled form.
- Archived or voided Lease/invoice: preserve the record and status, but do not offer payment recording.
- Fully paid invoice: show completed payment/receipt context and return to the full Lease record.
- Direct-to-owner invoice: return to the stable Lease summary and link to the existing Finance `Confirm owner collection` action.

## Responsive And Accessibility Contract

- At 1440 x 900 and 1280 x 800, the resolution heading, progress line, payment form, and Lease context remain visible without document-level horizontal overflow.
- Below the wide breakpoint, the Lease-context column stacks beneath the payment form.
- The progress line exposes the same completed/current/future meaning in text, not color alone.
- The page retains one H1 and logical H2 order.
- Form errors are programmatically associated and announced.
- The primary action has an exact accessible name including the amount when known.
- Links and controls retain visible focus, keyboard operation, and 200 percent zoom usability.
- Reduced motion uses immediate state changes; no new page animation is required.

## Visual Thesis

A calm, flat operating record with one unmistakable resolution path: neutral paper-like surfaces, exact alignment, thin dividers, restrained status color, and no decorative card collection.

## Content Plan

1. Lease identity and status
2. Exact issue and current resolution stage
3. Payment form with nearby Lease context
4. Recent activity
5. Upcoming dated work

## Interaction Thesis

- URL-backed focused action preserves orientation and browser navigation.
- The current progress stage updates only after authoritative server results.
- Existing drawer/form focus and feedback behavior is reused; no ornamental motion is added.

## Implementation Boundaries

### In scope

- Focused Lease payment-resolution state
- Focused Lease/Finance read model for one selected invoice
- Reuse or extraction of the current tenant-payment form and action contract
- Approved Lease context, Recent activity, and Upcoming presentation
- Copy cleanup for the focused state
- Focused tests and authenticated local browser review

### Out of scope

- Universal record-page framework
- Unit, Property, Person, or Maintenance implementation
- New payment semantics or accounting classifications
- New database migrations or hosted changes
- Rebuilding the Finance workspace
- Role-specific page variants
- Push, merge, deployment, or production mutation

## Verification

Implementation must use RED/GREEN tests covering:

- URL-backed focused resolution and stable-summary return
- Correct selected-invoice and Lease scope
- Payment permission and collection-route behavior
- Existing payment action submission and receipt-result handling
- Deposit amount plus received-state presentation
- `Recent activity` wording and absence of user-facing `Recent evidence`
- Upcoming source priority and omission when no future item exists
- Error, success, stale-invoice, unauthorized, and already-paid states
- Responsive structure and accessible headings/control names

Final local verification includes focused Lease/Finance suites, the Layer 1 regression suites, TypeScript, ESLint, full Vitest, and authenticated browser inspection at desktop and mobile widths.
