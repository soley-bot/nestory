# Optional role template setup

The new-role editor offers **Property & Finance** and **Operations**. Super Admin remains the existing built-in authority, not a custom-role preset. No existing Property Manager, Operations or other role is renamed or rewritten. The historical Property Manager constant is retained for compatibility; its earlier scope is documented below.

## Current templates

Property & Finance includes 19 keys:

```
properties.view properties.write properties.archive
people.view people.write people.archive
leases.view leases.prepare leases.activate leases.change_terms leases.close leases.archive
finance.view finance.record_payments finance.submit_expenses finance.approve_expenses
finance.post_expenses finance.correct_expenses finance.correct_records
```

This covers owners/tenants, leases, payments, deposits, expense posting/approval and supported audited financial corrections/reversals. Existing approval also enables petty-cash management and owner-opening review. Existing submission enables owner-opening submission/correction requests. Custody checks require the combined lease/finance authorities. These permissions do not bypass receipt requirements, self-approval restrictions, attribution, immutable statements or locked periods. Financial removal remains the existing checked reversal/void workflow, not destructive history deletion.

Period close, reopening/unlocking, statement publication, reconciliation-source administration and staff/settings administration are excluded. General reports currently require finance.publish and are therefore also excluded; report reading must not be advertised as included. Super Admin semantics remain unchanged, including existing explicit-grant exceptions for tenant posting.

Operations includes properties.view plus maintenance.view, maintenance.create_assign, maintenance.complete and maintenance.review. Property reading is full branch-scoped property/unit context. Existing maintenance permissions allow repair-cost submissions for Finance review; they do not grant expense approval or posting. Do not describe this as zero financial submissions. No people, lease or general finance permissions are included.

Both presets fill only a new editor draft. Dirty/submitting drafts cannot be replaced by a preset; existing roles do not show template buttons. Saving and assigning remain separate explicit actions. Ordinary access, active custom role and same-company active branch remain required. Deployment makes no membership or ordinary-access changes.

## Historical Property Manager preset

This historical preset is no longer offered by the new-role editor. Its exported definition remains unchanged for compatibility. Previously selecting it only filled a draft; it did not save a role, assign users, enable ordinary access, create a branch or change existing grants. A Super Admin separately reviewed roles and named assignments.

Assign the member to the intended active branch, such as Phnom Penh, within the same organization. Properties must belong to that branch. Ordinary access, the branch and the custom role must all be active. The template does not provide organization-wide access.

## Included permissions

- View/add/edit properties and people (including tenants).
- View, prepare, activate, change terms and close leases.
- View finance and record payments; submit expenses; post expenses directly; edit posted expenses through audited replacement.
- View, create/assign, complete and review maintenance.

Existing lease-term permission also controls deposit events and their reversals. This existing coupling is displayed in the editor; this template does not introduce a separate deposit-only restriction. Deposit custody confirmation and deposit-to-rent reversals may require additional authority and are not granted by expense correction. Review the desired deposit duties before assigning the template.

## Expense authority

`finance.post_expenses` permits the new atomic expense posting route, together with `finance.submit_expenses`. `finance.correct_expenses` permits atomic approved-expense replacement, also with submission permission. Both remain scoped to every affected property in the assigned branch.

These new permissions do not authorize reviewing someone else's pending expense, standalone reversal/deletion, general financial corrections, user administration, period closing/reopening or report publication. Existing owner-opening submission behavior remains associated with the existing Submit expenses permission; final approval is not included.

An expense edit retains the original, reversal and replacement history. Locked periods, frozen statements, deposit/invoice attribution, receipt validation and idempotency checks still apply. Ordinary pending review and standalone reversal retain their existing authorization.

A tenant expense draft cannot reuse its retry key across review submission and direct posting. If permissions change while a submission result is uncertain, refresh and check the existing expense before trying another action; conflicting submission paths fail without adding a second expense.

No existing role receives the new keys automatically. Existing owner direct-post and correction authority is preserved. Tenant direct posting requires an explicit new posting grant on an active custom role; the existing Super Admin permission shortcut alone does not turn it on.

## Before assigning staff

Review the proposed permissions and deposit duties with the owner. Confirm named users and their branch. Do not copy Pilot's Super Admin memberships or enable ordinary access as a side effect of deploying this feature. Setup and actual financial transactions require their own authorization.

For IPS, the property/unit copy manifest is a separate task. This feature does not create IPS, transfer data, set October opening balances or change DNS.
