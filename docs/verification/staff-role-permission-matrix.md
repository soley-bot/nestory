# Ordinary roles and branch access: current contract

Inspected baseline: main `1cd2207940a9d9b1c79b80fa7c26f6368c080aab`. This matrix describes existing keys and their application projections; it does not approve new authority or replace checked server/database enforcement. Every ordinary operation requires enabled ordinary access, a current membership, an active nonempty custom role, one active assigned branch, the matching operation permission and valid same-company/branch records. Workflow assignment, lifecycle, actor and finance checks still apply. SuperAdmin remains a separate company-scoped control.

## Existing permission matrix

| Domain | Existing key | Operation mapping |
| --- | --- | --- |
| Properties | `properties.view` | View eligible Properties and Units |
| Properties | `properties.write` | Add/edit eligible Properties and Units |
| Properties | `properties.archive` | Checked Property/Unit archive and restore |
| People | `people.view` | View identities through eligible branch relationships; nested records stay scoped |
| People | `people.write` | Add/edit through the existing explicit branch relationship predicate |
| People | `people.archive` | Checked identity archive/restore through existing relationship rules |
| Leases | `leases.view` | Read eligible leases and linked projections |
| Leases | `leases.prepare` | Prepare drafts |
| Leases | `leases.activate` | Activate eligible leases |
| Leases | `leases.change_terms` | Terms changes; also the current deposit event/reversal guard |
| Leases | `leases.close` | Close eligible leases |
| Leases | `leases.archive` | Checked lease archive/restore |
| Finance | `finance.view` | Scoped finance/owner-balance/readiness reads; does not itself grant report export |
| Finance | `finance.record_payments` | Payment recording and current-rent retry projection |
| Finance | `finance.submit_expenses` | Expense/opening-balance submission projection |
| Finance | `finance.approve_expenses` | Approval/petty-cash/opening-balance review projection |
| Finance | `finance.correct_records` | Correction authority; expense reversal additionally requires approval authority |
| Finance | `finance.close_periods` | Eligible period/owner-close projection, subject to checked workflow scope |
| Finance | `finance.publish` | Official statement publication projection; also report access and PDF/Excel export |
| Maintenance | `maintenance.view` | Scoped task/case reads |
| Maintenance | `maintenance.create_assign` | Create/assign and structure/state controls; actual cost recording projection |
| Maintenance | `maintenance.complete` | Assigned ordinary executor completion, with staff/assignment checks |
| Maintenance | `maintenance.review` | Completion review and maintenance-cost submission projection |

Selecting a dependent permission adds its domain's View key through the existing normalizer. Removing View clears that domain's dependents. The preview uses those same normalized keys; it does not add keys outside the existing catalog.

| Restricted operation | Existing ordinary-role boundary |
| --- | --- |
| Staff access/role administration | SuperAdmin only; all custom catalog permissions still exclude it |
| Explicit Person branch link create/archive | Existing public workflow requires SuperAdmin |
| Maintenance evidence upload | Excluded by the ordinary application capability projection |
| Maintenance archive/restore | Excluded by the ordinary application projection; intended delegated RPC alignment remains a policy review item |
| Reconciliation setup / reopening locked financial months | Excluded by the ordinary capability projection |
| Cross-company records | Always outside this company membership's scope |
| Physical core DELETE / unchecked raw writes | Existing checked workflow and Data API boundaries remain |

Deposit guard coupling is not a claim that every ordinary deposit UI caller is enabled or that every event passes its finance/account checks. Report publication is not a blanket company-wide grant. The role preview deliberately labels record/workflow requirements rather than promising every selected operation succeeds.

## Implemented local usability/infrastructure slice

`buildRolePermissionPreview` normalizes the selected and baseline keys, produces domain operation/change rows, and reads the existing ordinary capability projectors for sensitive effects and excluded operations. `RolePermissionPreview` is read-only; the role editor incorporates it and places deposit/report consequences directly beneath the relevant checkboxes. It displays current/proposed selection, existing single-branch limits, additions/removals, deposit/report coupling, and exclusions. It has no grant or assignment control. Existing checkboxes, flexible role edits, version/confirmation flow, save actions and audit RPCs are unchanged.

The checked role save in `20260822010340_custom_role_catalog_and_memberships.sql` logs per-key `organization_role_permission_added` / `organization_role_permission_removed` activity and advances the role version. This patch does not impose fixed presets or immutable roles and does not change the audit contract. Synthetic component/action regressions exercise the existing edit/confirmation/version behavior; no hosted or disposable database write is needed for this presentation slice.

## Exact remaining policy and release gates

1. A+B ordinary assignments: approve uniform role permissions across selected branches versus branch-specific roles; combined reports/artifacts; partial revocation/inactive-branch/reactivation behavior; grant administration. The existing A+B design remains proposed. No junction schema, role grant, set-based RLS or fake multi-branch UI is implemented here.
2. Deposit authority: decide receipt, retention, refund and reversal independently of lease terms, including finance approval/correction requirements. No new deposit key or enabled sensitive caller is introduced.
3. Report authority: decide independent read/export versus official publication. A report-only role cannot be promised while report routes require Publish; no preset silently grants Publish.
4. Maintenance evidence/archive: decide eligible executor/coordinator/reviewer upload and lifecycle authority, and archive/restore delegation. Keep existing application restrictions until the reviewed server/UI contract is implemented together.
5. Shared Person identity: decide global field edits/archive when relationships exist outside assigned scope; preserve explicit relationship administration restrictions meanwhile.
6. Release: coordinator confirms file ownership/integration, independently reviews the exact candidate and runs relevant CI before any separately authorized publication/deployment. No live staff conversion or actual membership change belongs to this patch.

Coordination scope for thread `01a0f1c6-1aab-7373-86a0-74d79c95500b`: new `src/features/organization/role-permission-preview.ts` and test; new `components/role-permission-preview.tsx` and test; this new matrix document; `components/role-editor.tsx` preview and adjacent-hint integration. No Access settings, finance UI/copy, permission catalog, actions, shared components, database types or migration files are edited. Direct cross-thread messaging is unavailable in this execution environment; this explicit ownership note accompanies the parent handoff.

The exclusion heading describes unavailable current workspace controls, not an exhaustive database authority guarantee. Related permission hints are visible before selection and linked to their checkbox descriptions. Permission policy remains pending; phone-layout approval does not resolve it.
