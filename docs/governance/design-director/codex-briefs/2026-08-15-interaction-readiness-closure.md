# Codex brief 2 — Close frontend interaction-readiness regressions

**Priority:** P1 acceptance closure
**Owner:** Codex frontend implementation
**Bounded routes:** `/petty-cash`, `/properties/[propertyId]`, and the shared primitives directly required by those routes

## Problems

1. `npx tsc --noEmit` fails because the petty-cash `details` element uses an unsupported `defaultOpen` prop in the current type environment.
2. Two petty-cash component tests fail after `Post to ledger` changed from a drawer to a modal; the tests attempt the wrong close affordance and do not complete the focus-return assertion.
3. Property record sections use a mixed link/button `tablist` and `window.history.pushState`; current evidence does not prove arrow-key semantics, back/forward restoration, or focus continuity.

## Required outcome

Deliver a type-clean, tested modal focus contract for petty cash and a semantically coherent, URL-restorable property section navigation contract. Preserve all financial payloads, capability visibility, server actions, and canonical route destinations.

## Allowed implementation scope

- `src/features/petty-cash/components/petty-cash-screen.tsx`
- `src/features/petty-cash/components/petty-cash-screen.test.tsx`
- `src/features/properties/components/property-detail-view.tsx`
- `src/features/properties/components/property-detail-screen.tsx`
- Their focused tests
- `src/components/ui/modal.tsx` only if a shared focus-return defect is demonstrated by a focused test

Do not alter product contracts, data loaders, database behavior, route authorization, or unrelated redesign surfaces.

## Interaction constraints

### Petty cash

- Keep posting/void/rollover as focused consequential dialogs if the compact modal pattern is retained.
- The close button and Cancel must return focus to the actual initiating control (preview or action trigger).
- Escape must close when safe and return focus.
- Preserve the posting payload and all hidden identity/idempotency fields.
- Replace or type the disclosure-open behavior without suppressing TypeScript errors.
- Rename `Receipt and accounting` to operational wording such as `Receipt and reconciliation` unless product governance explicitly approves accounting-system language.

### Property sections

Choose one coherent pattern:

- **Navigation pattern:** ordinary links with `aria-current="page"`, server/search-param restoration, and no `tablist`; or
- **Tabs pattern:** complete tab semantics with arrow-key navigation, one active tab stop, controlled panels, and URL/back-forward synchronization.

Do not leave mixed route links and local buttons under an incomplete tab contract. Account remains a canonical route link, and browser back/forward must restore the visible section.

## Acceptance

1. `npx tsc --noEmit` passes for the touched scope (report unrelated failures separately).
2. The focused petty-cash suite passes and explicitly verifies close button, Cancel, Escape, and focus return for modal posting at 1024px and 390px assumptions.
3. The property detail suite proves keyboard semantics and URL/back-forward restoration for Overview, Units, Maintenance, Files, and Account navigation.
4. No mutation payload, capability check, or route destination changes.
5. Run and report:
   - focused petty-cash and property-detail tests;
   - `npm run test:ui-copy`;
   - `npm run test:ui-coverage`;
   - `npx tsc --noEmit`;
   - `git diff --check`.
6. If a disposable local browser is available, capture `/petty-cash` and `/properties/[propertyId]` at 1280x800 and 390x844 in light/dark, including keyboard close/focus and back/forward behavior. Do not substitute production.
