# Workspace Access Register and Member Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the card-and-drawer Workspace Access screen with one compact access register and a shadcn Dialog that unifies existing-Staff invitation and inline Staff creation.

**Architecture:** Keep `AccessSettingsScreen` as the orchestration boundary for loaded data, settings navigation guards, URL focus, selected register view, and dialog state. Extract pure register filtering, the register presentation, and the Add Member state machine into focused files while retaining the existing guarded membership and invitation row behavior. Inline Staff creation calls `createPersonAction` first, then calls the finalized `inviteOrganizationUserAction`; it never claims the two durable operations are atomic.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, repository-owned shadcn/Radix primitives, Vitest, Testing Library, Supabase server actions.

## Global Constraints

- Work only in `D:/nestory/.claude/worktrees/admin-onboarding-invites-audit-7d2a99` on `claude/admin-onboarding-invites-audit-7d2a99`.
- Do not edit `src/features/organization/actions.ts`, Supabase migrations, or invitation-delivery code owned by `D:/nestory/.worktrees/admin-onboarding-backend`.
- Use existing shadcn primitives and Nestory theme tokens; do not install another component system or add page-specific hex colors.
- Use one full-width compact register with exactly `Active`, `Invitations`, and `No access`; do not render `Revoked`.
- Use `Dialog`, not `SideDrawer`, for Add member and keep destructive confirmation in `AlertDialog` or the existing confirmation primitive.
- Keep People's `Add Staff` capability and the existing `/users-roles?personId=<id>` handoff.
- Preserve `personId`, `memberId`, and `invitationId` deep links, duplicate focus, Staff-email mismatch warning, dirty dismissal guard, settings navigation guard, and final-Super-Admin protection.
- Do not send a hosted invitation or mutate production during frontend verification.

## File Structure

- Create `src/features/organization/components/access-register-model.ts`: pure view selection, no-access eligibility, filtering, and focus-to-view helpers.
- Create `src/features/organization/components/access-register-model.test.ts`: exact unit contracts for the register model.
- Create `src/features/organization/components/access-register.tsx`: compact header, line tabs, toolbar, register tables/cards, and row composition.
- Create `src/features/organization/components/access-register.test.tsx`: view, filtering, focus, empty-state, and responsive-presentation tests.
- Create `src/features/organization/components/add-member-dialog.tsx`: Dialog shell and three-step existing/new Staff workflow.
- Create `src/features/organization/components/add-member-dialog.test.tsx`: staged flow, Staff creation, recovery, duplicate, focus, and dirty-dismissal tests.
- Modify `src/features/organization/components/access-settings-screen.tsx`: reduce it to orchestration plus retained membership/invitation behavior exported for register composition.
- Modify `src/features/organization/components/access-settings-screen.test.tsx`: replace obsolete card/drawer expectations with integration coverage for the register and dialog.
- Modify `src/features/organization/components/access-settings-screen.ssr.test.tsx`: assert the new header/register SSR contract without client-only failures.
- Modify `src/app/(dashboard)/users-roles/page.tsx`: pass separate active Staff options and historical linked people, and preserve validated deep-link defaults.
- Modify `src/app/(dashboard)/users-roles/page.test.tsx`: verify active Staff versus historical linked-person data reaches the screen correctly.
- Verify, but do not change unless a regression is found: `src/features/people/components/people-screen.tsx`, `src/features/people/components/workspace-access-status.tsx`, and their tests.

---

### Task 1: Register Domain Model

**Files:**
- Create: `src/features/organization/components/access-register-model.ts`
- Create: `src/features/organization/components/access-register-model.test.ts`

**Interfaces:**
- Consumes: `OrganizationBranch`, `OrganizationInvitation`, `OrganizationMembership`, `OrganizationStaffOption`, and `buildAccessByPersonId`.
- Produces: `type AccessRegisterView = "active" | "invitations" | "no_access"`, `getInitialAccessRegisterView(...)`, `getNoAccessStaff(...)`, and `filterAccessRegister(...)`.

- [ ] **Step 1: Write failing model tests**

```ts
it("selects the view containing the validated focus target", () => {
  expect(getInitialAccessRegisterView({ focusedMemberId: "member-1" })).toBe("active");
  expect(getInitialAccessRegisterView({ focusedInvitationId: "invite-1" })).toBe("invitations");
  expect(getInitialAccessRegisterView({ requestedStaffId: "staff-1" })).toBe("no_access");
  expect(getInitialAccessRegisterView({})).toBe("active");
});

it("includes only active Staff with no membership or live invitation", () => {
  expect(getNoAccessStaff({ branches, invitations, members, staff }, now).map((person) => person.id))
    .toEqual(["staff-without-access"]);
});

it("filters name, email, role, and scope without changing source arrays", () => {
  expect(filterAccessRegister({ branches, invitations, members, people, query: "mina", role: "all", scope: "all" }).members)
    .toHaveLength(1);
});
```

- [ ] **Step 2: Run the model tests and confirm the missing-module failure**

Run: `npx vitest run src/features/organization/components/access-register-model.test.ts`

Expected: FAIL because `access-register-model.ts` does not exist.

- [ ] **Step 3: Implement the pure register model**

```ts
export type AccessRegisterView = "active" | "invitations" | "no_access";

export function getInitialAccessRegisterView({ focusedInvitationId, focusedMemberId, requestedStaffId }: {
  focusedInvitationId?: string;
  focusedMemberId?: string;
  requestedStaffId?: string;
}): AccessRegisterView {
  if (focusedInvitationId) return "invitations";
  if (focusedMemberId) return "active";
  if (requestedStaffId) return "no_access";
  return "active";
}

export function getNoAccessStaff(input: AccessRegisterInput, now = new Date()) {
  const eligible = uniqueActiveStaff(input.staff);
  const access = buildAccessByPersonId(
    eligible.map((person) => person.id),
    input.members,
    input.invitations,
    now,
    input.branches,
  );
  return eligible.filter((person) => access[person.id]?.state === "no_access");
}
```

Implement normalized lowercase matching against member name/email, invitation email/linked Staff, and no-access Staff name/email. Role and scope filters use exact role and branch IDs; organization-wide records match the sentinel `organization` scope.

- [ ] **Step 4: Run the model tests**

Run: `npx vitest run src/features/organization/components/access-register-model.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the model**

```powershell
git add -- src/features/organization/components/access-register-model.ts src/features/organization/components/access-register-model.test.ts
git commit -m "feat: add workspace access register model"
```

### Task 2: Compact Access Register

**Files:**
- Create: `src/features/organization/components/access-register.tsx`
- Create: `src/features/organization/components/access-register.test.tsx`
- Modify: `src/features/organization/components/access-settings-screen.tsx`

**Interfaces:**
- Consumes: Task 1 model helpers plus `MemberAccessForm` and `PendingInvitationRow`, exported from `access-settings-screen.tsx` during this task.
- Produces: `AccessRegister(props)` with `activeView`, `onViewChange`, `onAddMember`, `onGrantStaff`, loaded access arrays, focus IDs, and draft registration callbacks.

- [ ] **Step 1: Write failing register tests**

```tsx
it("renders one lifecycle register with three line tabs", () => {
  render(<AccessRegister {...props} activeView="active" />);
  expect(screen.getByRole("tab", { name: /Active 2/ })).toHaveAttribute("data-state", "active");
  expect(screen.getByRole("tab", { name: /Invitations 1/ })).toBeVisible();
  expect(screen.getByRole("tab", { name: /No access 1/ })).toBeVisible();
  expect(screen.queryByRole("tab", { name: /Revoked/ })).toBeNull();
});

it("keeps search visible and filters the selected view", async () => {
  render(<AccessRegister {...props} activeView="active" />);
  await userEvent.type(screen.getByRole("searchbox", { name: "Search workspace access" }), "mina");
  expect(screen.getByText("Mina Chen")).toBeVisible();
  expect(screen.queryByText("Admin Staff")).toBeNull();
});

it("opens Add member from a No access row", async () => {
  render(<AccessRegister {...props} activeView="no_access" />);
  await userEvent.click(screen.getByRole("button", { name: "Add access for Mina Chen" }));
  expect(onGrantStaff).toHaveBeenCalledWith(person);
});
```

- [ ] **Step 2: Run the register tests and confirm failure**

Run: `npx vitest run src/features/organization/components/access-register.test.tsx`

Expected: FAIL because `AccessRegister` does not exist.

- [ ] **Step 3: Implement the compact register shell**

Build one bordered surface with this stable hierarchy:

```tsx
<section className="overflow-hidden rounded-lg border bg-card" data-testid="access-register">
  <Tabs value={activeView} onValueChange={(value) => onViewChange(value as AccessRegisterView)}>
    <div className="flex min-w-0 flex-col border-b px-3 pt-2 sm:px-4">
      <TabsList variant="line" aria-label="Workspace access views">
        <TabsTrigger value="active">Active <Badge tone="neutral">{members.length}</Badge></TabsTrigger>
        <TabsTrigger value="invitations">Invitations <Badge tone="neutral">{invitations.length}</Badge></TabsTrigger>
        <TabsTrigger value="no_access">No access <Badge tone="neutral">{noAccessStaff.length}</Badge></TabsTrigger>
      </TabsList>
      <AccessRegisterToolbar />
    </div>
    <TabsContent value="active"><ActiveAccessTable /></TabsContent>
    <TabsContent value="invitations"><InvitationTable /></TabsContent>
    <TabsContent value="no_access"><NoAccessTable /></TabsContent>
  </Tabs>
</section>
```

Use `SearchInput` or `Input type="search"`, `SelectControl`, `Table`, `Badge`, `Button`, and existing tokens. Desktop rows are 40-48px. At widths below `md`, render semantic stacked rows with the same status and primary action; do not add document-level horizontal scrolling or a side inspector.

- [ ] **Step 4: Export the retained row units and replace raw action buttons with shadcn primitives**

In `access-settings-screen.tsx`, export `MemberAccessForm`, `PendingInvitationRow`, `AccessDraftController`, and the helper types required by the register. Replace raw Resend/Revoke/Manage buttons encountered in those units with `Button` variants while preserving their exact labels, confirmation behavior, and focus refs.

- [ ] **Step 5: Run register and existing access tests**

Run: `npx vitest run src/features/organization/components/access-register.test.tsx src/features/organization/components/access-settings-screen.test.tsx`

Expected: new register tests PASS; existing tests may still fail only where they assert the old three-card layout or SideDrawer copy. Record those assertions for Task 4 rather than weakening behavioral protections.

- [ ] **Step 6: Commit the register**

```powershell
git add -- src/features/organization/components/access-register.tsx src/features/organization/components/access-register.test.tsx src/features/organization/components/access-settings-screen.tsx
git commit -m "feat: build compact workspace access register"
```

### Task 3: Unified Add Member Dialog

**Files:**
- Create: `src/features/organization/components/add-member-dialog.tsx`
- Create: `src/features/organization/components/add-member-dialog.test.tsx`
- Modify: `src/features/organization/components/access-settings-screen.tsx`

**Interfaces:**
- Consumes: `createPersonAction`, `inviteOrganizationUserAction`, loaded active Staff, branches, memberships, invitations, and duplicate-focus callback.
- Produces: `AddMemberDialog({ open, onOpenChange, defaults, ... })`, with internal `step: "access" | "staff" | "review"`, `staffMode: "existing" | "new"`, and recoverable `createdStaff` state.

- [ ] **Step 1: Write failing staged-flow tests**

```tsx
it("skips Staff for organization-wide access", async () => {
  render(<AddMemberDialog {...props} open />);
  await userEvent.type(screen.getByLabelText("Invitation email"), "finance@example.com");
  await chooseOption("Access level", "Finance Manager");
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByText("Review invitation")).toBeVisible();
  expect(screen.queryByText("Staff record")).toBeNull();
});

it("requires branch and Staff for Operations", async () => {
  render(<AddMemberDialog {...props} open />);
  await chooseOption("Access level", "Operations Member");
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByText("Choose a branch.")).toHaveAttribute("role", "alert");
});

it("creates Staff before sending the invitation", async () => {
  createPerson.mockResolvedValue({ personId: "staff-new", roles: ["staff"], status: "success" });
  invite.mockResolvedValue({ message: "Invitation sent.", status: "success" });
  render(<AddMemberDialog {...props} open />);
  await completeNewStaffPath();
  await userEvent.click(screen.getByRole("button", { name: "Send invitation" }));
  expect(createPerson.mock.invocationCallOrder[0]).toBeLessThan(invite.mock.invocationCallOrder[0]);
  expect(Object.fromEntries(invite.mock.calls[0][1])).toMatchObject({ personId: "staff-new" });
});
```

- [ ] **Step 2: Write failing recovery and dismissal tests**

```tsx
it("keeps the new Staff fields when Staff creation fails", async () => {
  createPerson.mockResolvedValue({ fieldErrors: { displayName: ["Enter a display name."] }, status: "error" });
  await submitNewStaffPath();
  expect(screen.getByText("Enter a display name.")).toBeVisible();
  expect(invite).not.toHaveBeenCalled();
});

it("offers Retry invitation when Staff persists but invitation creation fails", async () => {
  createPerson.mockResolvedValue({ personId: "staff-new", roles: ["staff"], status: "success" });
  invite.mockResolvedValue({ message: "Invitation was not created.", status: "error" });
  await submitNewStaffPath();
  expect(screen.getByText("Staff saved; invitation not created")).toBeVisible();
  expect(screen.getByRole("button", { name: "Retry invitation" })).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Retry invitation" }));
  expect(createPerson).toHaveBeenCalledTimes(1);
  expect(invite).toHaveBeenCalledTimes(2);
});

it("asks before discarding a dirty dialog and restores focus to Add member", async () => {
  const trigger = screen.getByRole("button", { name: "Add member" });
  await userEvent.click(trigger);
  await userEvent.type(screen.getByLabelText("Invitation email"), "draft@example.com");
  await userEvent.keyboard("{Escape}");
  expect(screen.getByRole("alertdialog", { name: "Discard member invitation?" })).toBeVisible();
});
```

- [ ] **Step 3: Run dialog tests and confirm failure**

Run: `npx vitest run src/features/organization/components/add-member-dialog.test.tsx`

Expected: FAIL because `AddMemberDialog` does not exist.

- [ ] **Step 4: Implement the Dialog shell and step state machine**

Use repository primitives:

```tsx
<Dialog open={open} onOpenChange={requestOpenChange}>
  <DialogContent className="max-h-[calc(100dvh-1rem)] overflow-hidden p-0 sm:max-w-2xl">
    <DialogHeader className="border-b px-5 py-4">
      <DialogTitle>Add member</DialogTitle>
      <ol aria-label="Invitation progress" className="mt-3 grid grid-cols-3 gap-2 text-xs">
        {steps.map((item) => <StepMarker key={item.id} current={item.id === step} {...item} />)}
      </ol>
    </DialogHeader>
    <form className="flex min-h-0 flex-col" onSubmit={submitCurrentStep}>
      <div className="min-h-0 overflow-y-auto px-5 py-4">{stepContent}</div>
      <DialogFooter className="m-0 rounded-none px-5 py-3">
        {canGoBack ? <Button type="button" variant="outline" onClick={back}>Back</Button> : null}
        <Button type="submit">{primaryLabel}</Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
```

Step 1 contains email, role, and conditional branch. Step 2 exists only for Operations and provides `Existing Staff` and `Create Staff` choices. New Staff fields are `displayName`, `partyType` default `individual`, `primaryEmail` prefilled from invitation email, and optional `primaryPhone`; submit hidden `roles=staff`, empty `legalName`, `notes`, and `taxIdentifier`. Step 3 shows only invitation email, role, scope, and Staff when applicable.

- [ ] **Step 5: Implement sequential persistence and bounded recovery**

```ts
async function persistInvitation() {
  let personId = selectedExistingStaffId;
  if (isOperationsRole(role) && staffMode === "new" && !createdStaff) {
    const staffResult = await createPersonAction({}, buildStaffFormData(newStaff));
    if (staffResult.status !== "success" || !staffResult.personId) {
      setStaffFailure(staffResult);
      setStep("staff");
      return;
    }
    personId = staffResult.personId;
    setCreatedStaff({ id: personId, label: newStaff.displayName, primaryEmail: newStaff.primaryEmail });
  }
  const result = await inviteOrganizationUserAction({}, buildInvitationFormData({ branchId, email, personId, role }));
  handleInvitationResult(result, { personId });
}
```

Classify existing action messages without inventing success:

- a success closes the dialog and returns focus to Add member;
- `Invitation saved, but email delivery failed` transitions to the Invitations view and announces `Invitation saved; delivery failed`;
- `Email delivery may have occurred` keeps a high-visibility recovery state and directs the user to Invitations without a success claim;
- a generic invitation error after `createdStaff` displays `Staff saved; invitation not created` and offers Retry invitation, which skips Staff creation.

- [ ] **Step 6: Preserve duplicate and mismatch behavior**

Before mutation, derive duplicate active member/invitation targets from selected Staff and normalized invitation email. Show one inline warning with `Review access` or `Review invitation`; invoking it closes the dialog, changes the register view, and focuses the existing row. If selected/new Staff email differs from invitation email, show `Not <name>'s Staff email.` as a warning, not an error.

- [ ] **Step 7: Run dialog tests**

Run: `npx vitest run src/features/organization/components/add-member-dialog.test.tsx`

Expected: PASS.

- [ ] **Step 8: Commit the dialog**

```powershell
git add -- src/features/organization/components/add-member-dialog.tsx src/features/organization/components/add-member-dialog.test.tsx src/features/organization/components/access-settings-screen.tsx
git commit -m "feat: unify member and staff onboarding"
```

### Task 4: Screen Orchestration and Deep Links

**Files:**
- Modify: `src/features/organization/components/access-settings-screen.tsx`
- Modify: `src/features/organization/components/access-settings-screen.test.tsx`
- Modify: `src/features/organization/components/access-settings-screen.ssr.test.tsx`
- Modify: `src/app/(dashboard)/users-roles/page.tsx`
- Modify: `src/app/(dashboard)/users-roles/page.test.tsx`

**Interfaces:**
- Consumes: `AccessRegister`, `AddMemberDialog`, and Task 1 model helpers.
- Produces: the final `/users-roles` orchestration, validated deep-link focus, and distinct `staff` versus `people` props.

- [ ] **Step 1: Replace obsolete screen tests with the approved integration contract**

Keep all current mutation, draft, duplicate, final-admin, and focus tests. Replace only layout/copy assertions tied to `Needs access`, separate cards, `Add Staff`, `Invite Staff`, and SideDrawer:

```tsx
it("renders a compact Workspace access header and one Add member action", () => {
  render(<AccessSettingsScreen {...props} />);
  expect(screen.getByRole("heading", { name: "Workspace access" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Add member" })).toBeVisible();
  expect(screen.queryByRole("link", { name: "Add Staff" })).toBeNull();
  expect(screen.getByTestId("access-register")).toBeVisible();
});

it("opens the focused lifecycle view before focusing a deep-linked row", async () => {
  render(<AccessSettingsScreen {...props} focusedInvitationId={pendingInvitation.id} />);
  expect(screen.getByRole("tab", { name: /Invitations/ })).toHaveAttribute("data-state", "active");
  await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId(`access-invitation-${pendingInvitation.id}`)));
});
```

- [ ] **Step 2: Run the screen tests and confirm the old orchestration fails**

Run: `npx vitest run src/features/organization/components/access-settings-screen.test.tsx src/features/organization/components/access-settings-screen.ssr.test.tsx`

Expected: FAIL on the new header/register/dialog expectations.

- [ ] **Step 3: Reduce `AccessWorkspace` to orchestration**

Keep draft controller aggregation and settings navigation registration. Replace card rendering and `inviteDrawerState` with:

```ts
const [view, setView] = useState<AccessRegisterView>(() => getInitialAccessRegisterView({
  focusedInvitationId,
  focusedMemberId,
  requestedStaffId: deepLinkInvitePersonId,
}));
const [dialog, setDialog] = useState<{ open: boolean; defaults?: InviteDefaults }>({
  open: Boolean(deepLinkInvitePersonId),
  defaults: inviteDefaults,
});
```

Render a compact page header containing `Workspace access` and one `Add member` button, then `AccessRegister`, then `AddMemberDialog`. `onGrantStaff(person)` opens the same dialog with that Staff selected. Duplicate/recovery callbacks set the appropriate register view before focusing its row with `requestAnimationFrame`.

- [ ] **Step 4: Pass active Staff separately from historical linked people**

Update the screen props to:

```ts
type AccessSettingsScreenProps = {
  staff: OrganizationStaffOption[];
  people: OrganizationStaffOption[];
  // existing branches, members, invitations, deep-link, current-user, and header props
};
```

In `page.tsx`, pass `staff={data.staff}` and `people={data.linkedPeople ?? data.staff}`. Add a page test proving archived historical Staff remains available for a linked member row but is absent from Add member and No access eligibility.

- [ ] **Step 5: Run screen and page tests**

Run: `npx vitest run src/features/organization/components/access-settings-screen.test.tsx src/features/organization/components/access-settings-screen.ssr.test.tsx "src/app/(dashboard)/users-roles/page.test.tsx"`

Expected: PASS.

- [ ] **Step 6: Commit orchestration**

```powershell
git add -- src/features/organization/components/access-settings-screen.tsx src/features/organization/components/access-settings-screen.test.tsx src/features/organization/components/access-settings-screen.ssr.test.tsx 'src/app/(dashboard)/users-roles/page.tsx' 'src/app/(dashboard)/users-roles/page.test.tsx'
git commit -m "refactor: wire workspace access lifecycle flow"
```

### Task 5: People Handoff Regression Gate

**Files:**
- Verify: `src/features/people/components/people-screen.tsx`
- Verify: `src/features/people/components/people-screen.test.tsx`
- Verify: `src/features/people/components/person-detail-screen.test.tsx`
- Verify: `src/features/people/components/workspace-access-status.tsx`
- Verify: `src/features/people/people.insights.test.ts`

**Interfaces:**
- Consumes: existing `/users-roles?personId=...`, `memberId`, and `invitationId` URLs.
- Produces: evidence that People retains Add Staff while all access actions enter the unified Workspace Access flow.

- [ ] **Step 1: Run existing People access-handoff tests**

Run: `npx vitest run src/features/people/components/people-screen.test.tsx src/features/people/components/person-detail-screen.test.tsx src/features/people/people.insights.test.ts`

Expected: PASS with `Grant workspace access` targeting `/users-roles?personId=<id>` and active/pending/failed/expired states preserving their focus IDs.

- [ ] **Step 2: Add one regression assertion only if the existing suite lacks it**

The exact assertion is:

```ts
expect(getWorkspaceAccessPresentation("staff-1", { state: "no_access" })).toMatchObject({
  actionLabel: "Grant workspace access",
  href: "/users-roles?personId=staff-1",
});
```

Place it in the closest existing workspace-access presentation test; do not duplicate it if already covered.

- [ ] **Step 3: Re-run the People gate**

Run: `npx vitest run src/features/people/components/people-screen.test.tsx src/features/people/components/person-detail-screen.test.tsx src/features/people/people.insights.test.ts`

Expected: PASS.

- [ ] **Step 4: Commit only if a People test or presentation file changed**

```powershell
git add -- src/features/people
git commit -m "test: protect staff to access handoff"
```

If no file changed, do not create an empty commit.

### Task 6: Full Verification and Browser Critique

**Files:**
- Modify only if verification exposes a defect: files already named in Tasks 1-5.

**Interfaces:**
- Consumes: complete redesigned access flow.
- Produces: passing focused/full gates and visually verified compact layouts.

- [ ] **Step 1: Run formatting, type, and focused test gates**

Run:

```powershell
npx eslint src/features/organization/components/access-register-model.ts src/features/organization/components/access-register.tsx src/features/organization/components/add-member-dialog.tsx src/features/organization/components/access-settings-screen.tsx 'src/app/(dashboard)/users-roles/page.tsx'
npx tsc --noEmit
npx vitest run src/features/organization/access-status.test.ts src/features/organization/components/access-register-model.test.ts src/features/organization/components/access-register.test.tsx src/features/organization/components/add-member-dialog.test.tsx src/features/organization/components/access-settings-screen.test.tsx src/features/organization/components/access-settings-screen.ssr.test.tsx "src/app/(dashboard)/users-roles/page.test.tsx" src/features/people/components/people-screen.test.tsx src/features/people/components/person-detail-screen.test.tsx src/features/people/people.insights.test.ts
```

Expected: all commands exit 0.

- [ ] **Step 2: Run repository UI gates**

Run:

```powershell
npm run test:ui-copy
npm run test:ui-coverage
```

Expected: both commands exit 0.

- [ ] **Step 3: Inspect the live page at desktop and mobile widths**

Using the existing local authenticated server, verify `/users-roles` at 1440x900, 1280x800, 390x844, and 200% zoom. Capture screenshots showing Active, Invitations, No access, each Add member step, and one failure/recovery state. Confirm:

- page title, Add member, tabs, toolbar, and first rows fit the initial desktop viewport;
- there is no side inspector, Add Staff button, Revoked tab, or generic help paragraph;
- the document does not overflow horizontally;
- dialog footer remains reachable without covering fields;
- keyboard focus enters the correct field, tabs work by keyboard, dirty Escape opens confirmation, and focus returns to the opener; and
- deep links focus the correct row or prefilled dialog.

- [ ] **Step 4: Critique the screenshots and remove one unnecessary visual element**

Compare the implementation to the approved design: quiet neutral surface, compact 32-36px controls, 40-48px rows, one restrained register border, and lifecycle tabs as the signature. If a decorative badge, border, label, or spacing block does not encode status or structure, remove it and re-capture the affected view.

- [ ] **Step 5: Run the focused gates again after visual fixes**

Run the commands from Steps 1 and 2 again.

Expected: all commands exit 0.

- [ ] **Step 6: Commit final verified adjustments**

```powershell
git add -- src/features/organization/components src/app/(dashboard)/users-roles src/features/people
git commit -m "fix: finish workspace access redesign"
```

Do not commit audit screenshots or `.superpowers/brainstorm` artifacts.
