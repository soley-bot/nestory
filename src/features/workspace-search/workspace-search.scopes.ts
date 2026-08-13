import type { WorkspaceRole } from "@/lib/auth/context";
import type { WorkspaceSearchResult } from "@/features/workspace-search/workspace-search.types";

export type WorkspaceSearchScope =
  "properties" | "units" | "people" | "leases" | "tasks" | "documents";

export type WorkspaceSearchAction = WorkspaceSearchResult & {
  kind: "action";
  keywords: readonly string[];
};

const ADMIN_SCOPES = [
  "properties",
  "units",
  "people",
  "leases",
  "tasks",
  "documents",
] satisfies readonly WorkspaceSearchScope[];

const TASK_SCOPES = ["tasks"] satisfies readonly WorkspaceSearchScope[];
const FINANCE_SCOPES = ["leases"] satisfies readonly WorkspaceSearchScope[];

const ADMIN_ACTIONS = [
  action("overview", "Dashboard", "/overview", ["overview", "home"]),
  action("properties", "Properties", "/properties", ["buildings"]),
  action("units", "Units", "/units", ["apartments"]),
  action("people", "People", "/people", ["contacts"]),
  action("tenants", "Tenants", "/tenants"),
  action("owners", "Owners", "/owners"),
  action("staff", "Staff", "/staff", ["team"]),
  action("vendors", "Vendors", "/vendors"),
  action("maintenance", "Cases", "/maintenance", [
    "maintenance",
    "work orders",
  ]),
  action("tasks", "Tasks", "/tasks", ["assignments", "my work"]),
  action("work-orders", "Work Orders", "/work-orders", [
    "maintenance",
    "board",
  ]),
  action("inspections", "Inspections", "/inspections", [
    "maintenance",
    "checklist",
  ]),
  action("recurring-tasks", "Recurring Work", "/recurring-tasks", [
    "maintenance",
  ]),
  action("finance-work", "Finance work", "/finance", [
    "finance",
    "open work",
  ]),
  action("rent-income", "Rent", "/rent-income", [
    "income",
    "payments",
    "tenant invoices",
  ]),
  action("bills-expenses", "Expenses", "/bills-expenses", ["bills", "charges"]),
  action("balances", "Balances", "/balances", [
    "owners",
    "customers",
    "property accounts",
  ]),
  action("leases", "Leases", "/leases"),
  action("ledger", "Ledger", "/ledger"),
  action("petty-cash", "Petty Cash", "/petty-cash"),
  action("timeline", "Global Timeline", "/timeline", ["history"]),
  action("property-timeline", "Property Timeline", "/property-timeline", [
    "history",
  ]),
  action(
    "maintenance-timeline",
    "Maintenance Timeline",
    "/maintenance-timeline",
    ["history"],
  ),
  action("financial-timeline", "Financial Timeline", "/financial-timeline", [
    "history",
  ]),
  action("reports", "Reports", "/reports"),
  action("documents", "Documents", "/documents", ["files"]),
  action("import", "Import data", "/import", ["csv", "upload"]),
  action("settings", "Organization settings", "/settings"),
  action("users-roles", "Workspace Access", "/users-roles", [
    "access",
    "permissions",
    "users",
    "roles",
  ]),
] satisfies readonly WorkspaceSearchAction[];

const MANAGER_ACTIONS = [
  action("maintenance", "Cases", "/maintenance", [
    "maintenance",
    "work orders",
  ]),
  action("tasks", "Tasks", "/tasks", ["assignments"]),
] satisfies readonly WorkspaceSearchAction[];

const MEMBER_ACTIONS = [
  action("tasks", "Tasks", "/tasks", ["assigned work"]),
] satisfies readonly WorkspaceSearchAction[];

const FINANCE_ACTIONS = [
  action("finance-work", "Finance work", "/finance", ["finance", "open work"]),
  action("rent-income", "Rent", "/rent-income", [
    "income",
    "payments",
    "tenant invoices",
  ]),
  action("bills-expenses", "Expenses", "/bills-expenses", ["bills", "charges"]),
  action("balances", "Balances", "/balances", [
    "owners",
    "customers",
    "property accounts",
  ]),
  action("leases", "Leases", "/leases"),
  action("ledger", "Ledger", "/ledger"),
  action("petty-cash", "Petty Cash", "/petty-cash"),
] satisfies readonly WorkspaceSearchAction[];

export function getWorkspaceSearchScopes(
  role: WorkspaceRole,
): readonly WorkspaceSearchScope[] {
  if (role === "super_admin") return ADMIN_SCOPES;
  if (role === "finance_manager" || role === "finance_member") {
    return FINANCE_SCOPES;
  }

  return TASK_SCOPES;
}

export function getWorkspaceSearchActions(
  role: WorkspaceRole,
): readonly WorkspaceSearchAction[] {
  if (role === "super_admin") {
    return ADMIN_ACTIONS;
  }

  if (role === "finance_manager" || role === "finance_member") {
    return FINANCE_ACTIONS;
  }

  return role === "operations_manager" ? MANAGER_ACTIONS : MEMBER_ACTIONS;
}

function action(
  id: string,
  label: string,
  href: string,
  keywords: readonly string[] = [],
): WorkspaceSearchAction {
  return {
    href,
    id: `action:${id}`,
    keywords,
    kind: "action",
    label,
    meta: "Go to",
  };
}
