# Property Manager role setup

This is an optional template for a new custom role. Selecting it fills the role editor draft; it does not save a role, assign users, enable ordinary access, create a branch or change existing grants. A Super Admin must review and save the role and separately approve named assignments.

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
