# UI/UX audit — first admin, workspace onboarding, invitations

Date: 2026-08-12
Branch: `claude/admin-onboarding-invites-audit-7d2a99` (based on `main` @ `db18b2e`)
Scope: the three entry flows only —
1. standing up the first Super Admin of a workspace,
2. onboarding the workspace itself (identity, branches, teams),
3. inviting people and getting them signed in.

**No product code was changed.** Every finding below cites a file and, where the defect is
visual, the measurement that proves it.

## How this was verified

Static read of every file in the three flows, then the flows were driven live in a browser
against a seeded local stack (`supabase start` → `db:reset` → `db:test:fixture`, dev server from
this worktree on port 60206, signed in as the fixture Super Admin `nestory@gmail.com` and again
as `operations.member@nestory.com`). Layout claims are `getBoundingClientRect()` /
`getComputedStyle()` readings taken from the running app at a 1280px viewport, not estimates.

Three plausible-looking defects were checked and **withdrawn** before they reached this list —
the invite form's field labels (`aria-labelledby` resolves correctly), the Staff select rendering
blank (the selected name is drawn in an overlay span), and a duplicated member roster in the DOM
(a React streaming placeholder carrying `hidden`). They are recorded here so nobody re-files them.

---

## 0. The shape of the problem

The invitation surface is the most carefully built screen of the three — it has draft guards,
consequence previews, duplicate detection, confirmation dialogs. The problems are not that it
is under-designed. They are that **its safeguards fire in the wrong place**:

- the form lets you build an invalid combination, describes that combination as a settled
  outcome, and only objects at the moment you submit;
- when it does object, it says so 400px away from the field it is objecting to;
- when it detects a duplicate, it renders a warning band that contains no warning.

Around that screen sit two much larger gaps: **flow 1 has no interface at all**, and **flow 2
is create-only** — you can add branches and teams, and then never touch them again.

Severity 1 items are user-visible breakage. Severity 2 are defects with a clear cost.
Severity 3 are polish. Backend items are not listed here — they are in
[`docs/codex-handoff-admin-onboarding-2026-08-12.md`](docs/codex-handoff-admin-onboarding-2026-08-12.md).

---

## 1. Severity 1

### 1.1 A member of the workspace is told they are not a member of the workspace

**Reproduced live.** Signed in as `operations.member@nestory.com` — a fully provisioned member
with an active membership row — and opened `/users-roles`. The app redirects to `/no-access` and
renders:

> **No workspace access**
> This account is signed in, but it is not linked to this workspace.
> Ask a workspace administrator to add this email through Workspace Access, or sign in with an
> account that already belongs here.
>
> `[Use another account]` `[Return home]`

Every sentence is false for this user, and both offered actions lead away from the product:
"Use another account" signs them out, "Return home" is `/` — the marketing site. There is no
link back into the workspace they belong to.

The cause is that one route serves two unrelated conditions.
[context.ts:175](src/lib/auth/context.ts:175) redirects there when a user genuinely has no
membership; [context.ts:192](src/lib/auth/context.ts:192) redirects there when a member simply
lacks a capability. [no-access/page.tsx](src/app/no-access/page.tsx) only knows how to say the
first thing.

Operations roles do not see a Settings entry in the sidebar (verified — the nav for that role is
Tasks and Maintenance only), so this is reached by direct URL, bookmark, browser history, or one
of the `/users-roles?personId=…` deep links the People module generates. That makes it a
*returning-user* dead end, which is the worst kind: the person who hits it already had a reason
to believe they belonged.

**Fix (frontend):** distinguish the two states. Permission-denied should keep the user inside
the shell — "You don't have access to Settings", with a link back to their workspace entry point
— and reserve the sign-out wording for the genuine no-membership case. This needs a signal from
[context.ts:192](src/lib/auth/context.ts:192) (a `?reason=` on the redirect is enough); that one
line is shared auth plumbing, so it is listed as a coordination point in the Codex handoff.

### 1.2 The invite form presents an impossible combination as a confirmed outcome

**Reproduced live.** With the default role (Operations Member), the Access-scope select offers
"All branches" — [access-settings-screen.tsx:1550](src/features/organization/components/access-settings-screen.tsx:1550)
puts it in the list unconditionally. Selecting it produced this state:

| Surface | What it said |
|---|---|
| Access effect panel | Access scope: **All branches** · Linked staff record: **Not linked to a Staff record** · Effect: **Assigned work only** |
| Save button | **enabled** |
| On submit | **"Choose a Staff member."** |

The "Access effect" panel is the screen's promise about what will happen. Here it states, as
settled fact, an access grant the form will refuse to create and the server would reject anyway
([actions.ts:309](src/features/organization/actions.ts:309)). The panel's default text is
"Not linked to a Staff record" — which for an Operations role is not a description, it is an
error.

**Fix:** for Operations roles, drop "All branches" from the scope options and let the panel
render the unresolved requirement as a requirement, not as an outcome.

### 1.3 Validation errors are not attached to the field that is wrong

**Reproduced live.** After the failed submit above, the field that caused it carried:

- `aria-invalid` — **absent**
- `aria-describedby` — still pointing at its help text ("The employee or contractor this login
  belongs to."), not at the error

The only copy of the message lives in the action bar at the bottom of the drawer. Focus is moved
to the offending control ([access-settings-screen.tsx:507](src/features/organization/components/access-settings-screen.tsx:507)),
so a screen-reader user lands on a field that announces itself as valid while the explanation
sits in a region they have just been moved away from.

Errors are also reported **one at a time** — `validate` returns the first failure only
([access-settings-screen.tsx:446](src/features/organization/components/access-settings-screen.tsx:446)),
so with both staff and branch missing you fix one, submit, and discover the other.

**Fix:** set `aria-invalid` and point `aria-describedby` at the message, render it inline under
the control, and return all failures rather than the first.

### 1.4 The duplicate-access warning contains no warning

**Reproduced live.** Selecting a Staff member who already has access renders exactly this:

```html
<div class="… rounded-md border border-warning/30 bg-warning-soft px-3 py-2 …">
  <button type="button">Review access</button>
</div>
```

An amber band, `justify-end`, holding a single right-aligned link. The sentence that explains it
— "This Staff member already has workspace access." — is computed at
[access-settings-screen.tsx:484](src/features/organization/components/access-settings-screen.tsx:484)
and then passed only to `DraftActionBar`'s `disabledReason`, which prints it at the very bottom
of the drawer. The band at
[access-settings-screen.tsx:630](src/features/organization/components/access-settings-screen.tsx:630)
never renders `duplicateMessage`.

So the user sees an alarm-coloured strip that says nothing, and the reason for it somewhere else
entirely.

**Fix:** render `duplicateMessage` inside the band, left-aligned, with the action after it.

---

## 2. Severity 2

### 2.1 Two tabs of the same control put their content on different gutters

Measured at a 1280px viewport, sidebar expanded:

| Route | Page title `h1` left edge | First content card left edge |
|---|---|---|
| `/settings?section=branches` | 280px | **280px** |
| `/users-roles` | 280px | **272px** |

Both routes render the identical `PageHeader` + `SettingsTabs` header, so clicking "Workspace
Access" in that tab row shifts everything below it 8px to the left.

`PageHeader` is `px-4 sm:px-6` ([page-header.tsx:26](src/components/layout/page-header.tsx:26))
and `SettingsWorkspace` matches it with `px-4 py-4 sm:px-6`
([settings-workspace.tsx:102](src/features/organization/components/settings-workspace.tsx:102)).
The access surface uses `px-3 py-3 sm:px-4`
([access-settings-screen.tsx:247](src/features/organization/components/access-settings-screen.tsx:247))
— a different ramp from every sibling.

**Fix:** put the access surface on the page gutter, or on `WorkspacePage`.

### 2.2 Four fields, three control geometries, two background treatments

Measured inside the open invite drawer:

| Field | Height | Border radius | Background |
|---|---|---|---|
| Staff member (`PersonSelect`) | **36px** | 8px | solid `rgb(21,25,25)` |
| Invitation email (hand-rolled `<input>`) | **32px** | 8px | solid `rgb(21,25,25)` |
| Access level (`SelectControl`) | 32px | **10px** | **translucent** (`… / 0.3`) |
| Access scope (`SelectControl`) | 32px | 10px | translucent |

The consequence is visible without measuring anything: the two controls on row 1 sit 1.3px apart
at the top and end 4px apart at the bottom, and the two selects on row 2 start at **214px** and
**219.3px** — a 5.3px step across a row that reads as one line.

The email control is the avoidable part. It is a raw `<input>` with hand-copied classes at
[access-settings-screen.tsx:571](src/features/organization/components/access-settings-screen.tsx:571)
instead of the shared `Input`, and it reproduces `rounded-md` where the shared component is
`rounded-lg`.

**Fix:** use the shared `Input`; bring `PersonSelect` and `SelectControl` onto one height and one
radius.

### 2.3 The member roster prints the email twice and hides the person's name

Measured from the live Active list — the first row's text nodes, in order:

```
operations.manager@nestory.com     (text-sm font-semibold)   ← primary identity
operations.manager@nestory.com     (text-xs muted)           ← secondary identity
Access level   → Operations Manager
Access scope   → Phnom Penh Operations
Linked Staff   → Mara Sovan                                   ← the person's actual name
```

`accountLabel` falls back to the person's name only when the email is missing
([access-settings-screen.tsx:967](src/features/organization/components/access-settings-screen.tsx:967)),
and the sub-line prints the email unconditionally
([access-settings-screen.tsx:1067](src/features/organization/components/access-settings-screen.tsx:1067)).
Since members essentially always have an email, the identity block is duplicated for every row
and the human name is demoted to a fourth-column attribute.

**Fix:** lead with the name, put the email underneath, and drop the fourth column's redundancy.

### 2.4 A pending invitation cannot be corrected — only destroyed

`PendingInvitationRow` offers **Resend** and **Revoke** and nothing else
([access-settings-screen.tsx:829-846](src/features/organization/components/access-settings-screen.tsx:829)).
Sending an invitation with the wrong access level, wrong branch, or a typo'd address means
revoking it — which the confirm dialog correctly warns "will stop working immediately" — and
starting over. The invitee, meanwhile, may already be holding a link that now fails.

An edit affordance on the pending row would remove the most common reason to revoke.

### 2.5 "Manage" becomes a dead button while a row is dirty

[access-settings-screen.tsx:1094](src/features/organization/components/access-settings-screen.tsx:1094)
disables the expand/collapse toggle when `expanded && draft.status === "dirty"`. The intent is
sound — don't let unsaved edits vanish behind a collapse — but the button simply stops
responding, with no `disabledReason`, no tooltip, and no aria-disabled explanation. The row's
own `DraftActionBar` already has a discard-confirmation flow that handles exactly this; the
toggle should route into it rather than going dead.

### 2.6 Branches and teams are create-only

`BranchEditor` and `TeamEditor` render a list and an "Add …" drawer. Neither list row is
interactive — [branch-editor.tsx:126-142](src/features/organization/components/branch-editor.tsx:126)
renders `<span>`s. There is no rename, no address correction, no deactivation, no way to change a
team's branch or manager. `BranchEditor` even renders `branch.status` as a value while providing
no way to change it.

This lands hardest on onboarding, because branches are set up first and are the *scope* half of
every Operations invitation. A branch created with a typo'd code during setup is permanent from
the UI, and that code is what every future invite screen shows in its scope dropdown
(`${branch.code} - ${branch.name}`).

### 2.7 Workspace identity is read-only, so onboarding cannot finish in-product

The Organization section renders Workspace, Subdomain, Branches, Teams as flat facts
([settings-workspace.tsx:152-180](src/features/organization/components/settings-workspace.tsx:152)).
Both the name and the subdomain are set once, by the CLI, and cannot be corrected afterwards —
yet the subdomain determines tenant resolution
([tenant.ts](src/lib/auth/tenant.ts)) and the name appears on every invitation acceptance screen.

Combined with 2.6, the whole of flow 2 is: read four numbers, add branches, add teams. Nothing
established during onboarding can be revised.

---

## 3. Severity 3

- **`/workspace` renders nothing.** It is a bare redirect
  ([workspace/page.tsx](src/app/workspace/page.tsx)); every sign-in passes through it, and on a
  cold route compile the user sits on a blank document. A minimal `loading.tsx` would cover it.
- **Login fields carry no `required`.** Verified live: both inputs report `required: false`, so
  an empty submit round-trips to the server to be told what the browser could have said.
- **The request form's intent switch is two links, not a control.**
  [`RequestTypeLink`](src/features/marketing/components/public-interest-form.tsx:227) renders
  `<Link replace>` with `aria-current="page"` to express a form choice. It looks like a segmented
  control and behaves like navigation — no arrow-key movement, and `aria-current="page"` tells a
  screen reader this is the current *page*, not the selected option. A radio group styled the
  same way is the same visual with correct semantics.
- **"Grant access" and "Add Staff" bypass the settings navigation guard.** `SettingsTabs` routes
  clicks through `navigationGuard.handleNavigationClick`; the two links inside the access surface
  ([access-settings-screen.tsx:263](src/features/organization/components/access-settings-screen.tsx:263)
  and [:290](src/features/organization/components/access-settings-screen.tsx:290)) are plain
  `<Link>`s. A dirty member row is discarded silently when either is clicked.
- **Empty states restate their heading.** "Pending — No pending invitations.", "Needs access —
  All active Staff have access." The heading already carries a count badge; the sentence adds
  nothing.
- **`getScopeLabel` and the screen disagree about who is org-wide.**
  [access-status.ts](src/features/organization/access-status.ts) treats only `super_admin` as
  all-branches; the screen treats every non-Operations role that way
  ([access-settings-screen.tsx:73](src/features/organization/components/access-settings-screen.tsx:73)).
  They agree today only because finance memberships carry a null branch. Worth unifying before
  that stops being true.

---

## 4. Flow 1 has no interface

`provision_client_workspace` is called from exactly one place —
[`scripts/workspace-provision-core.mjs:48`](scripts/workspace-provision-core.mjs:48). A repo-wide
search finds no other caller; the only occurrence under `src/` is the generated type in
`database.generated.ts`.

So creating a workspace and its first Super Admin is:

```bash
npm run workspace:provision -- --name="Acme" --slug="acme" --admin="ops@acme.com"
```

run by an operator with `SUPABASE_SECRET_KEY` in their environment. There is no screen, no
confirmation, no record of who ran it, and no way to see whether the invitation landed. The
script prints `invitationState: "send_failed"` and exits 1 when delivery fails — and that string
in a terminal is the entire failure UI for the most important email the product ever sends.

**This is a deliberate product position, not an oversight** — `/request` says so plainly
("Client workspaces stay managed and invite-only", "Portfolio scope and workflow fit reviewed
before workspace provisioning"). Managed provisioning is a reasonable choice.

What is missing is the operator's half of it. If provisioning stays a CLI action, the workspace
still needs a screen where an operator can see **which workspaces exist, who their first admin
is, and whether that first invitation was delivered, opened, or has quietly expired** — because
today, a first admin whose invite bounced has no route into the product and nobody in the system
knows. That surface does not exist at any severity level in this audit because it does not exist
at all; it is a scoping decision for you, not a bug I can file.

---

## 5. Suggested order

Grouped so each block is one coherent change:

| # | Work | Files |
|---|---|---|
| 1 | Split permission-denied from identity-denied (§1.1) | `no-access/page.tsx`, + redirect signal from `context.ts` |
| 2 | Invite-form correctness: scope options, inline errors, duplicate message (§1.2–1.4) | `access-settings-screen.tsx` |
| 3 | Access surface onto the page gutter (§2.1) | `access-settings-screen.tsx` |
| 4 | One control geometry in the drawer; shared `Input` (§2.2) | `access-settings-screen.tsx`, `person-select.tsx`, `select-control.tsx` |
| 5 | Roster leads with the person (§2.3) | `access-settings-screen.tsx` |
| 6 | Edit a pending invitation; live "Manage" toggle (§2.4–2.5) | `access-settings-screen.tsx` + one server action (Codex) |
| 7 | Branch/team/workspace editing (§2.6–2.7) | `branch-editor.tsx`, `team-editor.tsx`, `settings-workspace.tsx` + RPCs (Codex) |
| 8 | Severity 3 sweep | as listed |

Items 6 and 7 need backend work that does not exist yet; both are in the Codex handoff.

## Verification gate

```bash
npm run lint && npm run test && npm run test:ui-copy && npm run test:ui-coverage
```
