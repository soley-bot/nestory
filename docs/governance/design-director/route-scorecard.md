# Frontend route scorecard

**Audit date:** 2026-08-15
**Observed tree:** `codex/lease-browser-polish` at committed HEAD `6a75a3c4e05064d8fd6f45467d98f7a4c49e6d34`, plus a dirty working tree
**Status vocabulary:** Ready / Conditional / Blocked / Not reassessed

## Audit boundary

This scorecard evaluates the current uncommitted frontend slice against `PROJECT.md`, `docs/design/enterprise-frontend-redesign-system.md`, the executable route/discoverability contracts, source diffs, and focused static/component checks. It is not release evidence and does not certify any exact commit.

The requested sources `AGENTS.md`, `docs/design/frontend-constitution.md`, `docs/design/design-director-operating-model.md`, `docs/governance/maintenance-agent-operating-model.md`, and `docs/design/agents/design-director-prompt.md` are absent from this checkout and all visible refs. The conservative governance-only boundary used here is limited to new files under `docs/governance/design-director/`.

## Current scorecard

| Route / workflow | Representative role | Structure and hierarchy | Workflow clarity | Accessibility / responsive | Evidence | Status | Director finding |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Authenticated shell and domain navigation | All five roles | Stronger domain disclosure and active-child semantics | Labels are clearer (`Work queue`, `Rent & collections`, `Owner accounts`) | App-shell component coverage passed in the focused run | Static discoverability 39/39; component suite passed | Conditional | Role homes remain correct. Lease placement now differs by role and from the accepted role architecture; settle the IA before treating navigation as final. |
| `/properties` register and property quick view | Super Admin | Dominant register retained; portfolio signals and 760px quick view improve scan-to-preview flow | Clear record shortcuts and canonical `Open property` action | Focused property tests passed; no current browser/reflow capture | Component tests only; historical browser evidence is stale | Conditional | Direction is coherent. Recheck the added portfolio summary and wide dialog at 1280x800, 390x844, dark/light, keyboard, and 200% zoom. |
| `/properties/[propertyId]` record | Super Admin | Five compact sections replace duplicated panels; add-unit and add-document actions are contextual | Overview/Units/Account/Maintenance/Files is a useful record model | Focused tests passed, but the mixed link/button `tablist` has no demonstrated arrow-key behavior and `pushState` state restoration is not evidenced | Component tests only | Conditional | Keep the consolidation; close the tabs/history contract before approval. |
| `/people` and role lenses | Super Admin | Table-first register and attention-only command center reduce decoration | Status replaces vague `Next`; redundant view switch removed | Focused people tests passed; browser evidence stale | Component tests only | Conditional | Good simplification. Product must confirm whether removing the distinct `inactive` relationship filter is intentional rather than conflating it with archive state. |
| `/people/[personId]` | Super Admin | Overview/Related consolidation and staff-only simplification reduce duplicated media/history surfaces | `View history` points to canonical history; edit/archive hierarchy is clearer | Focused tests passed; no current browser or assistive-technology check | Component tests only | Conditional | Coherent record direction. Verify modal focus return and staff-only heading/landmark sequence in browser. |
| `/finance` role home | Finance Manager / Finance Member | Queue-first role workspaces remain in place; transaction work stays secondary for manager | Role-specific primary actions preserved | Finance component tests passed; Super Admin browser check passed in light and dark themes | Current component and local-browser evidence; no fresh fixture role journey | Conditional | The work queue is meeting-ready for the checked Super Admin state. Fresh Finance Manager and Finance Member journeys remain required before release approval. |
| `/rent-income` and `/bills-expenses` | Finance Manager / Finance Member | Dense work surfaces and focused overlays are preserved | Payment, paid-cost submission, review, and reversal remain distinct | Finance tests and the UI copy gate passed | Current component evidence; no destructive browser submission | Conditional | Owner invoice payment terminology is now distinct. Live payment, paid-cost, review, and reversal round trips remain outside this checkpoint. |
| `/balances` and `/properties/[propertyId]/account` | Finance Manager / Finance Member / Super Admin | Property account is now a focused owner-scoped account view with compact metrics and activity | Owner selection, month, obligations, source activity, and deep link to balance operations are understandable | Focused owner-balance tests passed; no browser/reflow evidence | Component tests only; route implementation is uncommitted | Conditional | Stronger operational hierarchy. Validate no-owner, multiple-owner, unresolved-source, long-label, pagination, and role capability states in a real local browser. |
| `/ledger` | Finance roles / Super Admin | Table density is improved | The financial control now uses literal `Month lock`, `Lock`, and `Unlock` language | Ledger component/action tests, copy scan, and local browser modal check passed | Current component and Super Admin browser evidence | Conditional | The product-contract mismatch is resolved. A real authorized lock/unlock round trip and Finance-role capability check remain required before release approval. |
| `/petty-cash` | Finance roles | Register is materially cleaner and secondary actions are grouped | Entry/status/evidence remain reachable through progressive disclosure | TypeScript and the full UI tier pass after the modal conversion | Current component evidence; no fresh destructive browser submission | Conditional | The previous typing and focus-test blockers are resolved. Validate add, post, transfer, adjustment, and receipt workflows against a disposable local fixture before release approval. |
| Operations homes and maintenance workflows | Operations Manager / Operations Member | No material frontend diff audited in this slice | Existing role architecture not reassessed | No current role/browser run | Historical evidence only | Not reassessed | Do not infer readiness from unchanged source; shell changes still require both Operations role journeys to be rerun. |
| `/documents` and property-linked upload | Super Admin | Property-context upload removes redundant record selection | Category is constrained for create and links are fixed to the property | Focused document suite passed as part of the selected run | Component tests only | Conditional | Direction is sound. Browser-test fixed property/unit linkage, upload error, Escape, and focus return before approval. |

## Gate summary

- `npm run test:unit`: passed, 167 files / 1,073 tests.
- `npm run test:ui`: passed, 71 files / 626 tests.
- Finance-focused Vitest selection: passed, 30 files / 317 tests.
- `npm run test:ui-copy`: passed with 0 prohibited narration occurrences.
- `npm run test:ui-coverage`: passed, 48/48 routes.
- `npx tsc --noEmit`: passed.
- Changed-source ESLint: passed for 84 files.
- Migration portability tests: passed, 8/8; migration discipline passed against 68 immutable `origin/main` migrations.
- Local browser: `/finance` checked in light and dark themes; `/ledger` month-lock modal checked in light theme.
- No destructive mutation submission, fresh five-role journey, axe, local database fixture, build, hosted, or production checks were run.

## Approval rule

No blocked row may be represented as design-ready. Conditional rows need current local browser evidence at representative laptop and phone widths, both themes, keyboard/focus, and the role states named above. Historical 2026-08-13 evidence remains historical and does not certify this dirty tree.
