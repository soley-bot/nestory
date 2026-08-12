# Workspace Operations Core and Design Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each Nestory role land in a clear daily operating workspace while keeping authorization, financial effects, and workflow state in the core layer and giving Claude an explicit UI/UX ownership boundary.

**Architecture:** Keep the existing authenticated routes and domain workflows, but add small role-specific projection functions that turn current Finance and Overview data into prioritized workspace queues. `/workspace` becomes a server-side role redirect, Operations retains its proven queue model, and presentation components consume typed data without reproducing permission or prioritization rules.

**Tech Stack:** Next.js App Router, React, TypeScript, Supabase/Postgres, Vitest, Testing Library, Playwright-backed browser verification.

## Global Constraints

- Claude works only in `D:\nestory` on `ui/design-system`; Codex works only in `D:\nestory\.worktrees\ips-operational-readiness` on `codex/ips-operational-readiness` until an explicit integration step.
- Preserve `PROJECT.md` role authority: Finance Manager reviews and operates Finance; Finance Member reads Finance and submits paid costs; Operations Manager coordinates branch work; Operations Member sees assigned work; Super Admin retains the full allowed operating scope.
- Navigation and hidden controls are usability boundaries only. Server contexts, actions, RPCs, grants, and RLS remain authoritative.
- Do not add a generic workflow engine, custom roles, team ACLs, approval thresholds, or a new dashboard framework.
- Do not add a database migration for this workspace pass. `expense_submissions.submitted_by` and the existing Finance, Overview, Maintenance, and Task data are sufficient.
- Keep one visible workspace title/action composition, one dominant work surface, and no more than one secondary controls row.
- Keep raw UUIDs and internal field names out of ordinary operator labels.
- Every role-specific queue must define loading, empty, filtered-empty, permission, blocked, error, saving, and success behavior.
- Operations Manager and Operations Member are the reference pattern; do not broaden either role merely to match Super Admin screen count.
- Core logic must merge before UI integration. Claude rebases or merges the core contract before wiring the final components.

---

## Alignment Contract

### Audit conclusion

The role permissions and domain mutations are sound enough for this pass. The clarity problem is the composition of the operating workspace:

- `/workspace` is a cinematic extra click with no operational information.
- Super Admin `/overview` shows useful metrics but does not foreground a prioritized exception queue.
- Finance Manager and Finance Member both land on `/finance`, although their daily jobs are different.
- Finance Manager review work and Finance Member submission work are under `/bills-expenses`, one level away from the shared landing.
- Operations Manager `/maintenance` and Operations Member `/tasks` already provide the strongest queue-first model.

Fresh audit screenshots are stored at:

`C:\Users\USer\.codex\visualizations\2026\08\12\019ff4db-64de-7900-a357-cd21f95ede04\workspace-operations-audit`

### Claude owns

- The visual hierarchy, information density, responsive composition, interaction pattern, and final copy for the role workspaces.
- Figma or equivalent design coverage for Super Admin, Finance Manager, and Finance Member at 1440x900, 1280x720, and 390x844.
- Visual states for populated, empty, loading, blocked, error, and success outcomes.
- The presentation components that consume the core types after the core branch is merged.
- Keeping the primary action and next work visible without requiring horizontal scrolling.
- Accessible focus order, named regions, semantic tables or lists, modal/drawer focus management, and keyboard-visible actions.

Claude must not change:

- `src/lib/auth/capabilities.ts`
- `src/lib/auth/context.ts`
- Supabase migrations, RLS, grants, or RPC authority
- Finance mutation semantics or financial side effects
- Core queue priority rules
- The existing Operations role scope

### Codex owns

- Role entry routing and server redirects.
- Typed workspace queue contracts.
- Finance Manager and Finance Member queue composition and deterministic priority rules.
- Current-user scoping for the Finance Member submission queue.
- Super Admin attention ordering from existing Overview data.
- Operator-safe activity detail formatting.
- Server-side capability enforcement, tests, fixture assertions, and integration verification.
- Adapting route loaders to Claude's approved components after the core contract lands.

Codex will not change:

- Global visual tokens, typography, colors, spacing, or general component styling.
- Shared layout primitives owned by Claude unless an agreed data prop is required.
- People, Properties, or Units redesign files currently modified in Claude's checkout.
- The Maintenance or Tasks information architecture beyond removing technical activity noise.

### Shared integration contract

Claude designs against the interfaces in this plan. If a design needs another display field, Claude records the requested field and its user-facing purpose; Codex adds it to the typed projection. Claude does not derive permissions, priority, ownership, or financial status inside React components.

The integration order is:

1. Claude completes the three role-workspace designs and maps every visible value/action to the contract below.
2. Codex implements Tasks 1-5 in the isolated core worktree.
3. The core branch is reviewed and merged into the UI branch.
4. Claude implements the approved presentation against the merged types.
5. Codex runs Task 6 verification across all five roles and reports any contract mismatch without redesigning Claude's work.

---

## Target Workspace Behavior

| Role | Entry | Primary operating surface | Primary action |
| --- | --- | --- | --- |
| Super Admin | `/overview` | Prioritized cross-domain attention queue followed by portfolio context | Open the highest-priority exception |
| Finance Manager | `/finance` | Paid-cost review queue, maintenance handoffs, evidence blockers, then secondary Finance exceptions | Review the oldest highest-priority submission |
| Finance Member | `/finance` | Own rejected submissions, own awaiting-review submissions, and recent own decisions | Record paid cost |
| Operations Manager | `/maintenance` | Existing branch case queue and workflow handoffs | Open or create a case |
| Operations Member | `/tasks` | Existing assigned-task queue | Continue the next assigned task |

`/workspace` performs a server redirect to the role entry above. It does not render a second arrival page.

---

### Task 1: Preserve expense submitter provenance in the Finance read model

**Files:**
- Modify: `src/features/finance-operations/finance-operations.types.ts:111-150`
- Modify: `src/features/finance-operations/data/finance-operations.ts:108-180`
- Test: `src/features/finance-operations/data/finance-operations.test.ts`

**Interfaces:**
- Consumes: `expense_submissions.submitted_by`
- Produces: `ExpenseSubmissionSummary.submittedByUserId: string` and `ExpenseSubmissionSummary.reviewedAt: string | null`

- [x] **Step 1: Write the failing mapper test**

Add this assertion to the existing `toExpenseSubmissionSummary` test fixture:

```ts
expect(summary).toMatchObject({
  id: "submission-1",
  submittedByUserId: "finance-member-user-1",
});
```

Set the fixture row to:

```ts
submitted_by: "finance-member-user-1",
```

- [x] **Step 2: Run the focused test and confirm the contract is missing**

Run:

```powershell
npx vitest run src/features/finance-operations/data/finance-operations.test.ts
```

Expected: FAIL because `submittedByUserId` is absent.

- [x] **Step 3: Add the provenance field**

Add to `ExpenseSubmissionSummary`:

```ts
submittedByUserId: string;
```

Add to `toExpenseSubmissionSummary`:

```ts
submittedByUserId: submission.submitted_by,
```

- [x] **Step 4: Run the focused test**

Run:

```powershell
npx vitest run src/features/finance-operations/data/finance-operations.test.ts
```

Expected: PASS.

- [x] **Step 5: Commit the isolated read-model change**

```powershell
git add src/features/finance-operations/finance-operations.types.ts src/features/finance-operations/data/finance-operations.ts src/features/finance-operations/data/finance-operations.test.ts
git commit -m "feat: expose finance submission ownership"
```

### Task 2: Build deterministic role-specific Finance workspace projections

**Files:**
- Create: `src/features/workspace-operations/finance-workspace.types.ts`
- Create: `src/features/workspace-operations/finance-workspace.ts`
- Test: `src/features/workspace-operations/finance-workspace.test.ts`

**Interfaces:**
- Consumes: `FinanceOperationsData`, `WorkspaceRole`, and the authenticated `userId`
- Produces: `buildFinanceWorkspaceData(input): FinanceWorkspaceData`

Create this contract:

```ts
export type FinanceWorkspaceItemKind =
  | "expense-review"
  | "maintenance-cost-review"
  | "expense-rejected"
  | "expense-awaiting-review"
  | "expense-approved"
  | "rent-exception"
  | "tenant-balance"
  | "owner-balance";

export type FinanceWorkspaceQueueItem = {
  actionLabel: string;
  detail: string;
  href: string;
  id: string;
  kind: FinanceWorkspaceItemKind;
  priority: number;
  statusLabel: string;
  submittedAt?: string;
  title: string;
};

export type FinanceManagerWorkspaceData = {
  queue: FinanceWorkspaceQueueItem[];
  role: "finance_manager";
  totals: {
    awaitingReview: number;
    maintenanceHandoffs: number;
    missingEvidence: number;
    rentExceptions: number;
  };
};

export type FinanceMemberWorkspaceData = {
  primaryAction: {
    href: "/bills-expenses";
    intent: "record-paid-cost";
    label: "Record paid cost";
  };
  queue: FinanceWorkspaceQueueItem[];
  role: "finance_member";
  totals: {
    approvedRecently: number;
    awaitingReview: number;
    rejected: number;
  };
};

export type FinanceWorkspaceData =
  | FinanceManagerWorkspaceData
  | FinanceMemberWorkspaceData;
```

- [x] **Step 1: Write failing Finance Manager ordering tests**

Use a minimal `FinanceOperationsData` fixture with one maintenance-origin submitted cost, one general submitted cost without evidence, one general submitted cost with evidence, and one rent exception. Assert:

```ts
expect(result.role).toBe("finance_manager");
expect(result.queue.map((item) => item.kind)).toEqual([
  "maintenance-cost-review",
  "expense-review",
  "expense-review",
  "rent-exception",
]);
expect(result.totals).toEqual({
  awaitingReview: 3,
  maintenanceHandoffs: 1,
  missingEvidence: 1,
  rentExceptions: 1,
});
```

Priority is deterministic: maintenance handoffs first, missing-evidence submissions second, other submitted costs third, rent exceptions fourth, tenant balances fifth, and owner balances sixth. Within a priority, oldest `submittedAt` sorts first, then `id` ascending.

- [x] **Step 2: Write failing Finance Member ownership tests**

Use submissions from two users. Assert that the authenticated member sees only their own rejected, submitted, and approved items:

```ts
expect(result.role).toBe("finance_member");
expect(result.primaryAction).toEqual({
  href: "/bills-expenses",
  intent: "record-paid-cost",
  label: "Record paid cost",
});
expect(result.queue.every((item) => !item.id.startsWith("other-user"))).toBe(true);
expect(result.queue.map((item) => item.kind)).toEqual([
  "expense-rejected",
  "expense-awaiting-review",
  "expense-approved",
]);
```

Member priority is rejected first, awaiting review second, and approved within the last 30 days third. Reversed items remain available on the Expenses history page but do not enter the landing queue.

- [x] **Step 3: Run the new tests and confirm the selector is absent**

```powershell
npx vitest run src/features/workspace-operations/finance-workspace.test.ts
```

Expected: FAIL because the module does not exist.

- [x] **Step 4: Implement the pure projection**

Implement:

```ts
export function buildFinanceWorkspaceData(input: {
  data: FinanceOperationsData;
  now?: Date;
  role: "finance_manager" | "finance_member";
  userId: string;
}): FinanceWorkspaceData
```

Use only the supplied data. Do not query Supabase or inspect capabilities in this function. Every queue link must target an existing URL-backed state under `/bills-expenses`, `/rent-income`, `/balances`, or the existing maintenance task link.

- [x] **Step 5: Run the selector tests**

```powershell
npx vitest run src/features/workspace-operations/finance-workspace.test.ts
```

Expected: PASS.

- [x] **Step 6: Commit the projection contract**

```powershell
git add src/features/workspace-operations
git commit -m "feat: add role-specific finance workspace queues"
```

### Task 3: Replace the cinematic workspace page with a server redirect

**Files:**
- Modify: `src/app/workspace/page.tsx`
- Modify: `src/app/workspace/page.test.ts`
- Retain: `src/lib/auth/workspace-entry.ts`

**Interfaces:**
- Consumes: `requireWorkspaceContext()` and `getWorkspaceEntryPath(role)`
- Produces: a server redirect with no intermediate UI

- [ ] **Step 1: Replace the rendering expectations with redirect expectations**

Mock `next/navigation` and assert all role destinations:

```ts
const destinations = [
  ["super_admin", "/overview"],
  ["finance_manager", "/finance"],
  ["finance_member", "/finance"],
  ["operations_manager", "/maintenance"],
  ["operations_member", "/tasks"],
] as const;
```

For each role, assert `redirect(expectedPath)` and remove assertions for `Open workspace`, the arrival image, and the arrival card.

- [ ] **Step 2: Run the page test and confirm the current arrival composition fails the new contract**

```powershell
npx vitest run src/app/workspace/page.test.ts
```

Expected: FAIL because the page still renders the arrival screen.

- [ ] **Step 3: Implement the server redirect**

Replace the page body with:

```ts
import { redirect } from "next/navigation";

import { requireWorkspaceContext } from "@/lib/auth/context";
import { getWorkspaceEntryPath } from "@/lib/auth/workspace-entry";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const context = await requireWorkspaceContext();
  redirect(getWorkspaceEntryPath(context.role));
}
```

- [ ] **Step 4: Run the page and routing tests**

```powershell
npx vitest run src/app/workspace/page.test.ts src/lib/auth/workspace-entry.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the entry simplification**

```powershell
git add src/app/workspace/page.tsx src/app/workspace/page.test.ts
git commit -m "refactor: route directly into role workspaces"
```

### Task 4: Expose a prioritized Super Admin attention projection

**Files:**
- Create: `src/features/workspace-operations/admin-workspace.ts`
- Test: `src/features/workspace-operations/admin-workspace.test.ts`
- Modify after Claude design approval: `src/app/(dashboard)/overview/page.tsx`

**Interfaces:**
- Consumes: `OverviewScreenData.attentionItems`
- Produces: `buildAdminWorkspaceQueue(data): OverviewAttentionItem[]`

- [ ] **Step 1: Write the failing ordering test**

Assert that the selector sorts without mutating its input:

```ts
const input = [
  attention({ id: "records", priority: 30, count: 4 }),
  attention({ id: "finance", priority: 10, count: 2 }),
  attention({ id: "maintenance", priority: 10, count: 3 }),
  attention({ id: "empty", priority: 1, count: 0 }),
];

expect(buildAdminWorkspaceQueue({ attentionItems: input }).map((item) => item.id)).toEqual([
  "maintenance",
  "finance",
  "records",
]);
expect(input.map((item) => item.id)).toEqual(["records", "finance", "maintenance", "empty"]);
```

Rules: remove zero-count items; lower numeric `priority` comes first; equal priority uses larger count first; remaining ties use `id` ascending.

- [ ] **Step 2: Run the test and confirm the selector is absent**

```powershell
npx vitest run src/features/workspace-operations/admin-workspace.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure selector**

```ts
export function buildAdminWorkspaceQueue(
  data: Pick<OverviewScreenData, "attentionItems">,
): OverviewAttentionItem[]
```

Return a new array and preserve the existing `href`, `actionLabel`, `helper`, and tone. Do not duplicate Overview queries.

- [ ] **Step 4: Run the selector test**

```powershell
npx vitest run src/features/workspace-operations/admin-workspace.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the Admin projection**

```powershell
git add src/features/workspace-operations/admin-workspace.ts src/features/workspace-operations/admin-workspace.test.ts
git commit -m "feat: prioritize admin workspace attention"
```

### Task 5: Keep technical activity metadata out of the normal operator narrative

**Files:**
- Create: `src/features/workspace-operations/operator-activity.ts`
- Test: `src/features/workspace-operations/operator-activity.test.ts`
- Modify after Claude design approval: `src/features/maintenance/components/maintenance-screen.tsx:1421-1448`

**Interfaces:**
- Consumes: `ActivityChangeDetail[]`
- Produces: `getOperatorActivityDetails(details): ActivityChangeDetail[]`

- [ ] **Step 1: Write the failing sanitization test**

```ts
expect(getOperatorActivityDetails([
  { field: "Status", before: "Pending", after: "In progress" },
  { field: "Submission Id", before: "—", after: "031b68da-1111-2222-3333-444444444444" },
  { field: "Assignee Person Id", before: "—", after: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" },
  { field: "Vendor", before: "Unassigned", after: "Khmer Home Services" },
])).toEqual([
  { field: "Status", before: "Pending", after: "In progress" },
  { field: "Vendor", before: "Unassigned", after: "Khmer Home Services" },
]);
```

The filter normalizes underscores and hyphens to spaces, then removes fields whose final token is exactly `id`, `uuid`, or `hash`, plus values that are bare UUIDs or 64-character hexadecimal hashes. It preserves human labels such as `Paid`, `Vendor`, and `Status`.

- [ ] **Step 2: Run the test and confirm the formatter is absent**

```powershell
npx vitest run src/features/workspace-operations/operator-activity.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the pure formatter**

```ts
export function getOperatorActivityDetails(
  details: ActivityChangeDetail[],
): ActivityChangeDetail[]
```

The function returns a new array. Technical values remain in the underlying activity record for audit and debugging; only the ordinary operator projection omits them.

- [ ] **Step 4: Run the formatter test**

```powershell
npx vitest run src/features/workspace-operations/operator-activity.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the presentation-safe activity projection**

```powershell
git add src/features/workspace-operations/operator-activity.ts src/features/workspace-operations/operator-activity.test.ts
git commit -m "feat: sanitize operator activity details"
```

### Task 6: Integrate Claude's presentation and verify all five roles

**Files:**
- Modify: `src/app/(dashboard)/finance/page.tsx`
- Modify: `src/app/(dashboard)/overview/page.tsx`
- Modify: Claude-approved workspace presentation components
- Modify: `src/features/maintenance/components/maintenance-screen.tsx`
- Test: `src/app/(dashboard)/finance/finance-routes.test.tsx`
- Test: `src/features/finance-operations/components/finance-operations-screen.test.tsx` or Claude's replacement component test
- Test: `src/features/overview/components/overview-screen.test.tsx`
- Test: `src/features/maintenance/components/maintenance-screen.test.ts`

**Interfaces:**
- Consumes: Claude's approved components plus Tasks 1-5
- Produces: the complete role-specific operating workspace

- [ ] **Step 1: Add failing route integration tests**

For Finance Manager, assert `/finance` passes `buildFinanceWorkspaceData({ role: "finance_manager", userId, data })` to the approved manager workspace component. For Finance Member, assert the member projection is used and the primary `Record paid cost` action is present. For Super Admin, assert the Overview workspace receives `buildAdminWorkspaceQueue(data)`.

- [ ] **Step 2: Run the affected component and route tests**

```powershell
npx vitest run 'src/app/(dashboard)/finance/finance-routes.test.tsx' src/features/overview/components/overview-screen.test.tsx src/features/maintenance/components/maintenance-screen.test.ts
```

Expected: FAIL until the route loaders and Claude components consume the projections.

- [ ] **Step 3: Wire route data into Claude's approved components**

In `/finance`, pass `context.role` and `context.userId` into `buildFinanceWorkspaceData`. Keep existing Finance domain data loading and mutation components available behind the queue item links and approved drawers/modals. In `/overview`, pass the prioritized attention projection without replacing existing portfolio data. In Maintenance, pass `change.details` through `getOperatorActivityDetails` for the ordinary Activity list.

- [ ] **Step 4: Run focused tests**

```powershell
npx vitest run src/features/workspace-operations src/app/workspace/page.test.ts src/lib/auth/workspace-entry.test.ts 'src/app/(dashboard)/finance/finance-routes.test.tsx' src/features/overview/components/overview-screen.test.tsx src/features/maintenance/components/maintenance-screen.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run static verification**

```powershell
npm run lint
npx tsc --noEmit
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 6: Run authenticated browser verification**

Verify these exact role outcomes with the local five-role fixture:

1. Super Admin enters `/workspace`, lands on `/overview`, sees prioritized attention before secondary portfolio context, and every queue link opens its correct scoped destination.
2. Finance Manager enters `/workspace`, lands on `/finance`, sees submitted paid costs and maintenance handoffs before rent/balance exceptions, and can open the existing review flow.
3. Finance Member enters `/workspace`, lands on `/finance`, sees `Record paid cost`, only their own rejected/awaiting/recently-approved items, and cannot access review controls.
4. Operations Manager enters `/workspace`, lands on `/maintenance`, retains the current queue and next-action/next-handoff flow, and ordinary Activity does not show UUID/hash fields.
5. Operations Member enters `/workspace`, lands on `/tasks`, retains the assigned-only queue and cannot see Manager controls.
6. At 1440x900, 1280x720, and 390x844, the primary action and first queue action are reachable without horizontal scrolling.
7. Keyboard verification covers entry redirect, first actionable queue item, drawer/modal opening and closing, and focus return.

- [ ] **Step 7: Commit the integrated workspace behavior**

```powershell
git add src/app src/features
git commit -m "feat: align role workspaces with daily operations"
```

---

## Acceptance Gate

The work is complete only when:

- Claude's approved designs map every visible count, label, status, and action to a typed core field.
- No React component calculates role authorization, submission ownership, queue priority, or financial status.
- Finance Manager and Finance Member no longer receive the same operational composition on `/finance`.
- Finance Member does not see another user's personal submission queue.
- Existing Finance mutations and Maintenance-to-Finance handoffs remain unchanged.
- Operations role breadth and branch/assignment scope remain unchanged.
- `/workspace` performs a direct server redirect for all five roles.
- Ordinary activity labels contain no raw UUIDs or hashes.
- Focused tests, lint, TypeScript, `git diff --check`, and authenticated five-role browser verification pass.
- Evidence identifies the exact branch, SHA, worktree, runtime source, and local-versus-hosted boundary.

## Explicit Non-Goals

- No accounting rewrite.
- No new Finance mutation or approval authority.
- No generic universal dashboard.
- No new roles, role combinations, or configurable permissions.
- No new database tables or migrations.
- No redesign of People, Properties, Units, Reports, Ledger, or Petty Cash.
- No production, merge, push, or deployment action without separate user authorization.
