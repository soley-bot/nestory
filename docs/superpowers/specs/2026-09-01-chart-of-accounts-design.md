# Nestory Chart of Accounts Design

**Date:** 2026-09-01

**Status:** Approved direction; written design pending user review

**Branch:** `codex/finance-funding-sources`

## Purpose

Replace the customer-facing Funding Sources feature with a property-management
Chart of Accounts modeled on the useful parts of DoorLoop's workflow. Users
should manage familiar accounting accounts and select those accounts while
recording rent, deposits, expenses, and owner movements. Internal settlement
and allocation identities remain behind the application boundary.

This design supersedes the customer-facing `Funding sources` section of
`2026-08-08-operational-finance-reset-design.md`. It does not weaken the
existing checked financial mutation, immutable-event, month-lock, or audit
requirements.

## Product decision

Nestory will provide one organization-owned Chart of Accounts. Bank and cash
accounts are Asset accounts inside that chart. Expense and rent categories are
accounts inside the same chart. The UI will not expose a separate funding-source
register or ask users to understand reconciliation-source identity.

The first delivery is a property-accounting catalog connected to Nestory's
existing authoritative workflows. It is not a generic accounting engine. It
does not introduce arbitrary manual journal entries, bank feeds, merchant
accounts, bank reconciliation, trial balance, tax advice, or an editable
general ledger.

## Research basis

DoorLoop uses five familiar top-level account classes: Asset, Liability,
Equity, Income, and Expense. Bank accounts are Asset > Bank accounts. Accounts
may be active or inactive, may be nested beneath a parent, and may be enabled
for relevant lease actions. The expense form separates the account money is
paid from from the expense account used to categorize each line. Account
defaults connect the chart to daily workflows without making operators select
the same accounts repeatedly.

Nestory will adopt those interaction principles while preserving its own
host-scoped permissions, property visibility, owner-cash controls, and
append-only operational finance model.

## User vocabulary

Use these customer-facing terms consistently:

- Chart of Accounts
- Account
- Account type
- Sub-account
- Default for
- Bank account
- Pay from
- Category
- Active / Inactive
- Account activity

Do not show these implementation terms in the normal experience:

- funding source
- reconciliation source
- organization pooled
- property dedicated
- source identity
- stable uppercase identifier
- operational cash location

When property availability matters, say `All properties` or list the specific
property. Internal codes may remain in storage and audit tools but are not a
required user field.

## Information architecture

### Navigation and routes

- Finance navigation label: `Chart of Accounts`
- Canonical route: `/finance/accounts`
- `/finance/funding-sources` permanently redirects to `/finance/accounts`
- Property account pages link to the relevant filtered account activity rather
  than to the retired funding-source screen.

### Chart list

The page opens directly on a dense, searchable account table. It has no hero,
marketing copy, implementation disclaimer, or explanatory status banner.

Accounts are grouped in this fixed order:

1. Assets
2. Liabilities
3. Equity
4. Income
5. Expenses

Parent accounts are expandable and sub-accounts appear indented beneath them.
Within each group, accounts sort by optional account number and then account
name. Users can filter by account type and Active, Inactive, or All.

The table columns are:

| Column | Meaning |
| --- | --- |
| Account | Account name, optional number, and indented parent relationship |
| Type | Plain subtype such as Bank, Accounts receivable, Income, or Expense |
| Default for | Human-readable workflow roles such as Rent income or Security deposits |
| Description | Optional operator description |
| Status | Active or Inactive |
| Action | Open account or edit when authorized |

The top-right action is `New account`. A row click opens account activity. The
row action menu contains `Edit account` and, when safe, `Make inactive` or
`Make active`.

### New and edit account drawer

The drawer title is `New account` or `Edit account`. It uses progressive
disclosure rather than presenting database concepts.

`Account details` contains:

- Account type (required)
- Account name (required)
- Account number (optional)
- Description (optional)
- Active account
- Sub-account toggle and Parent account when enabled

`Use this account for` appears only when the selected type supports a workflow:

- Income: lease charges, including the optional Rent income default
- Expense: expense categories and lease credits
- Liability: lease deposits, including the optional Security deposit default
- Asset > Bank/Cash: pay-from and receive-into choices
- Equity: owner contribution or owner distribution defaults

Bank and cash accounts additionally show `Available to` with `All properties`
or one selected property. Currency is inherited from the organization and is
shown as locked only in the account detail when it matters; it is not a primary
form decision.

System-critical defaults may be renamed only when their semantic role remains
clear. Their type, required workflow role, and active state cannot be changed
in a way that would break an operational workflow.

### Account activity

Opening an account shows:

- account name, type, status, and description;
- current balance or period total with its basis clearly labeled;
- date range and property filters;
- a chronological table of dated activity with property, payee or tenant,
  description, increase, decrease, and running balance when the source data
  supports one;
- links to the authoritative expense, charge, payment, deposit, or owner event.

Nestory must not fabricate a running balance for account classes whose current
operational events cannot support one. Income and Expense accounts may show
period activity totals until a complete balance read model exists. Bank,
receivable, payable, deposit-liability, and equity balances must come from
checked, reconciled read models before the UI labels them as balances.

## Default account set

Every organization receives a small, usable starter chart:

### Assets

- Operating account — Bank; default pay-from and receive-into account
- Trust account — Bank; available for deposit custody
- Undeposited funds — Other current asset; system controlled
- Accounts receivable — Accounts receivable; system controlled
- Petty cash — Cash

### Liabilities

- Accounts payable — Accounts payable; system controlled
- Security deposits — Current liability; default lease-deposit account

### Equity

- Opening balance — Equity; system controlled
- Owner contributions — Equity; default owner-contribution account
- Owner distributions — Equity; default owner-distribution account
- Retained earnings — Equity; system controlled

### Income

- Rental income — Income; default recurring-rent account
- Late fees — Income
- Application fees — Income
- Other income — Other income

### Expenses

- Cleaning — Expense
- Management fees — Expense
- Repairs and maintenance — Expense
- Utilities — Expense
- Other expenses — Other expense

Organizations may add accounts and sub-accounts without changing the stable
meaning of system defaults.

## Daily workflow integration

### Expense

The expense drawer uses two distinct account decisions:

- `Pay from` selects an active Bank, Cash, Petty cash, or Credit card account.
- `Category` on each line selects an active Expense account.

Property, unit, description, amount, and owner-held allocation remain line
decisions. One transaction may contain multiple lines and categories. The
existing atomic approval, evidence, reversal, and owner-cash rules remain
authoritative.

### Rent and other tenant charges

Recurring and one-time rent charges select an active Income account enabled for
lease charges. The Rental income default is preselected for recurring rent.
Deposit charges select an active Liability account enabled for lease deposits.

### Payments and deposits

Receiving a tenant payment first records the tenant settlement and the selected
received-into account. Undeposited-funds behavior remains system controlled
where collection and bank deposit are separate events.

### Owner money

Owner contributions and distributions use their default Equity accounts while
the owner-balance lifecycle remains the authority for custody and who-owes-whom
calculations. The account label does not replace the existing owner allocation
or settlement rules.

## Data model

### Canonical account catalog

Add an organization-scoped `finance_accounts` table with:

- immutable ID and organization ID;
- optional parent account ID within the same organization;
- account class: `asset`, `liability`, `equity`, `income`, or `expense`;
- constrained subtype appropriate to the account class;
- optional account number, display name, normalized name, and description;
- active/archive state and audit identity;
- system role when the account is a protected default;
- flags for supported workflows such as lease charges or lease deposits;
- optional property availability for Bank and Cash accounts.

Parent and child must share organization and account class. Cycles are
forbidden. An inactive account remains readable for historical activity and is
excluded from new transaction selectors.

### Preserve operational authorities

`financial_reconciliation_sources` remains the checked operational identity for
where money moved. Each active Bank, Cash, Petty cash, Clearing, or Other cash
account maps one-to-one to the corresponding reconciliation source. The mapping
is created and updated only by checked account RPCs; users never manage the
source directly.

Existing `finance_categories` remain stable category identities during the
transition. Income and Expense accounts map to those rows so existing invoice,
paid-cost, report, idempotency, and reversal lineage remains valid. A later
review may consolidate the storage model, but this delivery does not rewrite
historical references.

### Account roles

Workflow defaults are stored as constrained organization-level roles pointing
to compatible active accounts. A role can reference only an allowed account
class/subtype. Required system roles cannot be cleared unless a compatible
replacement is selected in the same checked transaction.

### Migration and backfill

A new forward-only migration will:

1. create the account catalog, role, availability, and mapping structures;
2. seed the starter chart for every organization;
3. map existing reconciliation sources into compatible Asset accounts;
4. map existing owner-expense and tenant-billing categories into Expense and
   Income accounts without changing historical category IDs;
5. establish checked lifecycle RPCs and read policies;
6. verify every active operational source and category has exactly one account
   mapping before enabling the new UI.

Unknown, duplicate, or incompatible legacy mappings fail closed. No hosted
database is changed from a developer checkout; production release remains the
protected exact-main-SHA workflow described in repository policy.

## Permissions and mutations

- Super Admin may create, edit, activate, and inactivate accounts and change
  defaults through checked RPCs.
- Finance roles may read accounts allowed by their existing Finance and
  property scope.
- Restricted property roles see only accounts and activity available to their
  readable properties.
- Direct authenticated DML remains revoked.
- Every lifecycle RPC validates organization, type/role compatibility, parent
  integrity, property scope, active use, and idempotency.
- Accounts referenced by history are never deleted.

## Error and empty states

- Empty search: `No accounts match these filters.`
- No custom accounts: show the starter chart, not an onboarding essay.
- Incompatible parent: `Choose a parent with the same account type.`
- Account in use: `Choose a replacement default before making this account inactive.`
- Duplicate name/number: identify the conflicting field and keep the drawer
  open with the user's entries.
- Load failure: `Chart of Accounts could not be loaded. Try again.`

Internal exception names, RPC names, source codes, and database vocabulary do
not appear in customer-facing errors.

## Visual direction

Nestory keeps its quiet, dense authenticated workspace. The memorable element
is the account hierarchy itself: restrained grouped headers with clear
indentation and disclosure controls. There are no decorative financial icons,
large metric cards, gradients, or dashboard-style banners on this settings
surface.

Use the existing product typography and color tokens. Type, hierarchy, spacing,
focus treatment, and status contrast carry the design. The table remains useful
at desktop density and becomes a stacked label/value list on narrow screens.

## Accessibility

- Account groups and parent rows expose correct expanded state.
- Row actions have account-specific accessible names.
- The drawer traps focus, restores focus to its trigger, and reports field
  errors next to the relevant controls.
- Status is expressed with text as well as color.
- Keyboard users can search, filter, expand groups, open accounts, and use all
  lifecycle actions.

## Verification

### Database

- migration applies from a clean local reset;
- seed and backfill are deterministic and idempotent;
- parent-cycle, cross-organization, invalid-role, invalid-type, duplicate, and
  unsafe-inactivation attempts fail;
- historical source and category references remain valid;
- RLS and RPC role/property matrices pass;
- no direct authenticated DML becomes available.

### Application

- Chart list renders each type, nested accounts, defaults, active/inactive
  filters, search, empty, and error states;
- create/edit validation uses customer vocabulary;
- permissions hide mutations while retaining authorized read access;
- Expense `Pay from` and line `Category` selectors accept only compatible active
  accounts;
- rent and deposit selectors accept only enabled compatible accounts;
- legacy `/finance/funding-sources` links redirect to `/finance/accounts`;
- account activity links resolve to authoritative records.

### Browser

Verify with seeded data and real roles:

1. Super Admin creates an Expense sub-account and sees it nested in the chart.
2. The new account appears in an expense line Category selector.
3. Super Admin creates a Bank account and sees it in Pay from.
4. Finance Manager can read and use permitted accounts but cannot manage them.
5. Restricted roles cannot read accounts or activity outside their property
   scope.
6. An account in use cannot be made inactive until a safe replacement is set.
7. Historical activity remains visible after a non-default account is made
   inactive.

## Delivery boundaries

Included:

- canonical Chart of Accounts catalog;
- starter accounts and defaults;
- account hierarchy and lifecycle;
- hidden mapping to existing sources and categories;
- expense, rent, deposit, and owner-default integration;
- account activity derived from authoritative operational data;
- redirect from the retired funding-source route.

Excluded:

- generic manual journals;
- editable ledger postings;
- bank feeds and reconciliation;
- merchant onboarding or payment processing;
- arbitrary account deletion;
- trial balance and accountant close workflow;
- production schema or deployment changes before protected release approval.

## Acceptance criteria

The feature is complete when a property manager can open `Chart of Accounts`,
understand the list without implementation knowledge, create a compatible
account or sub-account, use it in the correct daily workflow, inspect its
activity, and safely inactivate it without losing history. No normal customer
screen uses funding-source or reconciliation-source language, and the existing
financial authority and audit guarantees remain intact.
