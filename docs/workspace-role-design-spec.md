# Role workspace design — Super Admin, Finance Manager, Finance Member

Companion to `docs/superpowers/plans/2026-08-12-workspace-operations-core-design-handoff.md`.
This is integration step 1: the three designs, with every visible value and action mapped to a
typed core field, plus the display fields the design needs Codex to add.

Branch: `ui/design-system`. Prototype: `docs/prototypes/03-role-workspaces.html`.

Nothing here changes `capabilities.ts`, `context.ts`, Supabase, route logic, Finance mutation
semantics, queue priority rules, or Operations scope. No component derives permission, ownership,
priority, or financial status — every such value arrives already resolved.

---

## 1. The reference pattern

Operations is the model, so all three workspaces reuse its anatomy rather than inventing one:

```
PageHeader          title · one primary action
Attention chips     non-zero counts only, each one a filter or a jump
Queue               the dominant surface — one row per unit of work
Secondary context   below the fold, never competing with the queue
```

Three rules carried over from Operations, and one correction to it:

- **Queue first.** The first thing on screen is the work, not a metric wall.
- **One primary action.** Everything else is a row action or an overflow item.
- **A row is a handle, not a record.** Enough to decide, then click through — the same rule that
  took People and Lease rows from three lines to one.
- **Correction:** Operations renders all six queue chips even when every one reads `0`. These
  workspaces render only non-zero counts, so an empty chip row means "nothing waiting" instead of
  six zeros competing for attention.

---

## 2. Super Admin — `/overview`

**Source:** `buildAdminWorkspaceQueue(data)` → `OverviewAttentionItem[]` (Task 4).
Portfolio context keeps its existing loader; it moves below the queue, it is not re-queried.

### Field map

| Visible element | Typed field | Notes |
|---|---|---|
| Queue row title | `label` | |
| Row count badge | `count` | Selector already drops zero-count items |
| Row supporting line | `helper` | One line, truncated with a title attribute |
| Row action | `actionLabel` → `href` | |
| Row status colour | `tone` | `OverviewMetricTone`, rendered as `Badge tone` |
| Row grouping order | `priority` | Render in array order; no client re-sort |
| React key | `id` | Never displayed |
| Header primary action | `queue[0].actionLabel` → `queue[0].href` | "Open the highest-priority exception" resolves to the first item |
| Chip row | `count` per item | Only items with `count > 0`, which the selector guarantees |
| Portfolio block | existing `OverviewScreenData` | Unchanged, rendered after the queue |

**No new fields required.** `OverviewAttentionItem` already carries everything the design shows.

### Composition

Header, then a chip row summarising the queue, then the queue itself as a semantic table, then the
existing portfolio metrics and property table. The queue occupies the first screen at all three
viewports; portfolio context begins below the fold at 390×844 and at the fold at 1280×720.

---

## 3. Finance Manager — `/finance`

**Source:** `buildFinanceWorkspaceData({ role: "finance_manager", userId, data })`
→ `FinanceManagerWorkspaceData` (Task 2).

### Field map

| Visible element | Typed field | Notes |
|---|---|---|
| Chip: Awaiting review | `totals.awaitingReview` | Hidden at 0 |
| Chip: Maintenance handoffs | `totals.maintenanceHandoffs` | Hidden at 0 |
| Chip: Missing evidence | `totals.missingEvidence` | Hidden at 0 |
| Chip: Rent exceptions | `totals.rentExceptions` | Hidden at 0 |
| Row title | `title` | |
| Row status badge | `statusLabel` + **`tone`** (requested) | |
| Row supporting line | `detail` | |
| Row amount | **`amountDisplay`** (requested) | Right-aligned, tabular |
| Row submitter | **`submittedByLabel`** (requested) | |
| Row age | `submittedAt` | Rendered relative — "3 days ago" |
| Row action | `actionLabel` → `href` | |
| Row order | `priority` | Render in array order |
| Header primary action | `queue[0].actionLabel` → `queue[0].href` | "Review the oldest highest-priority submission" |
| Kind grouping | `kind` | Drives the row icon only, never ordering |

### Columns

`Cost | Property / context | Submitted by | Age | Amount | Status | →`

Amount is right-aligned and tabular. Age is relative text derived from `submittedAt` — a
formatting concern, not a business rule, so it stays in the component.

---

## 4. Finance Member — `/finance`

**Source:** `buildFinanceWorkspaceData({ role: "finance_member", userId, data })`
→ `FinanceMemberWorkspaceData` (Task 2). The projection already scopes to the authenticated user;
the component filters nothing.

### Field map

| Visible element | Typed field | Notes |
|---|---|---|
| Header primary action | `primaryAction.label` → `primaryAction.href` | "Record paid cost". `intent` is not displayed |
| Chip: Rejected | `totals.rejected` | Hidden at 0 |
| Chip: Awaiting review | `totals.awaitingReview` | Hidden at 0 |
| Chip: Approved recently | `totals.approvedRecently` | Hidden at 0. Label says "Approved · last 30 days" |
| Row title | `title` | |
| Row status badge | `statusLabel` + **`tone`** (requested) | Rejected must read as danger, not neutral |
| Row supporting line | `detail` | For a rejection this carries the reason |
| Row amount | **`amountDisplay`** (requested) | |
| Row age | `submittedAt` | |
| Row action | `actionLabel` → `href` | |
| Row order | `priority` | Rejected, then awaiting, then approved |

### Columns

`Cost | Property / context | Age | Amount | Status | →`

No submitter column — every row is the signed-in member's own. **No review controls render at
all**, not disabled ones: an approve button a member can never use is noise, and hiding it is a
usability decision on top of the server's authority, not a substitute for it.

---

## 5. Display fields requested from Codex

Four additions to `FinanceWorkspaceQueueItem`. Each is required because the alternative is
deriving financial meaning inside React, which the contract forbids.

```ts
export type FinanceWorkspaceQueueItem = {
  actionLabel: string;
  /** Formatted, currency-aware amount for the row. Reviewing a paid cost
   *  without its amount is not possible at a glance. */
  amountDisplay: MoneyDisplayValue;
  /** Property / unit the cost belongs to, already operator-safe. */
  contextLabel: string;
  detail: string;
  href: string;
  id: string;
  kind: FinanceWorkspaceItemKind;
  priority: number;
  statusLabel: string;
  /** Display name for expense_submissions.submitted_by. Manager queue only;
   *  omitted for the member queue, which is single-user by construction. */
  submittedByLabel?: string;
  submittedAt?: string;
  /** Semantic colour for statusLabel. Without it the component would have to
   *  infer financial status from a string. */
  tone: "neutral" | "success" | "warning" | "danger" | "accent";
  title: string;
};
```

| Field | Why the design needs it | Consequence if omitted |
|---|---|---|
| `amountDisplay` | The queue is a paid-cost review queue | Manager must open every row to see what they are approving |
| `tone` | Badge semantics for `statusLabel` | Component would map status strings to colours — deriving financial status in React |
| `submittedByLabel` | Manager must see who submitted | Only `submittedByUserId` exists, and raw UUIDs are barred from operator labels |
| `contextLabel` | Which property/unit the cost belongs to | Triage requires it; `detail` is a single free-text line already carrying the reason on rejections |

`MoneyDisplayValue` is the existing `{ primary: string }` from `src/lib/money/format.ts`, so the
row renders through the existing `MoneyDisplay` component and inherits its formatting.

If Codex prefers `contextLabel` to stay inside `detail`, the design still works — but `detail`
must then be guaranteed to lead with the property/unit, and rejection reasons need a separate
field. One field per meaning is the cheaper contract.

---

## 6. State matrix

Every role queue defines all nine states. Same treatment for all three workspaces.

| State | Trigger | Treatment |
|---|---|---|
| Loading | Route pending | `ModuleLoading` matching this archetype: header, chip row, queue rows. Chips and columns match the real layout so there is no shift on hydration |
| Populated | `queue.length > 0` | Chips (non-zero only), queue, secondary context |
| Empty | `queue.length === 0`, no filter | `EmptyState` — title states the fact, body omitted, primary action retained. Manager: "Nothing waiting for review". Member: "No submissions yet" + Record paid cost |
| Filtered empty | Chip active, no matches | `EmptyState kind="filtered"` + "Clear filter" |
| Permission | Role lacks the surface | `EmptyState kind="permission"`. Never a disabled queue |
| Blocked | Item actionable only after another step | Row renders, action becomes a `Badge tone="warning"` naming the blocker; row stays clickable to the record |
| Error | Loader/action failure | `EmptyState kind="error"` with retry. Row-level failure uses `TransientFeedback` and leaves the queue standing |
| Saving | Action in flight | Row action shows a pending state and `aria-busy`; the queue does not reorder mid-flight |
| Success | Action completed | `TransientFeedback` with the outcome; the item leaves the queue on next load, never optimistically |

---

## 7. Responsive behaviour

Requirement: the primary action and the first queue action are reachable without horizontal
scrolling at all three viewports.

| Viewport | Composition |
|---|---|
| 1440×900 | Full column set. Queue and secondary context both visible; queue owns the first screen |
| 1280×720 | Same columns. Secondary context starts at the fold |
| 390×844 | Queue becomes a card list, not a horizontally scrolling table. Each card: title, status badge, amount, one context line, action. Chips scroll horizontally only if more than two are non-zero. The primary action moves into the header row and stays visible |

The mobile card list is a deliberate departure from Operations, which scrolls its table sideways.
A queue whose first action needs a sideways scroll fails the acceptance gate.

---

## 8. Accessibility

- Queue is a semantic `<table>` at desktop and a `<ul>` of cards at 390px — not a grid of `div`s.
- Each workspace region is named: `aria-label="Review queue"`, `aria-label="Portfolio context"`.
- Chips are links with `aria-current="page"` when active, not buttons that mutate hidden state.
- Row action is a real link or button reachable by keyboard; the whole row is a click target but
  never the only one.
- Drawers and modals keep the existing focus-return behaviour; opening from a queue row returns
  focus to that row's action.
- Relative ages carry an absolute `title` and `<time dateTime>`.
- Tone is never the sole carrier of meaning — every toned badge also has a text label.

---

## 9. Open questions for Codex

1. **`tone` source.** Should tone come from the projection (preferred, one rule) or should the
   contract expose the raw submission state and let a shared, non-React mapper resolve it?
2. **`submittedByLabel` resolution.** Task 1 exposes `submittedByUserId`. Does the Finance read
   model already join a display name, or does this need a lookup the plan's "no migration"
   constraint permits?
3. **Relative age.** The design formats `submittedAt` in the component. Confirm that counts as
   formatting and not a business rule.
4. **Blocked state.** Which `kind` values can be blocked, so the design covers the real set rather
   than a guess?
