import type { WorkspaceSearchResult } from "@/features/workspace-search/workspace-search.types";
import type { PermissionKey } from "@/lib/auth/permission-catalog";

export type WorkspaceSearchScope =
  | "properties"
  | "units"
  | "people"
  | "leases"
  | "tasks"
  | "documents";

export type WorkspaceSearchAction = WorkspaceSearchResult & {
  kind: "action";
  keywords: readonly string[];
};

type WorkspaceSearchAuthority = {
  isSuperAdmin: boolean;
  permissionKeys: ReadonlySet<PermissionKey>;
};

const ADMIN_SCOPES = [
  "properties",
  "units",
  "people",
  "leases",
  "tasks",
  "documents",
] satisfies readonly WorkspaceSearchScope[];

const ADMIN_ACTIONS = [
  action("overview", "Dashboard", "/overview", ["overview", "home"]),
  ...propertyActions(),
  ...peopleActions(),
  ...leaseActions(),
  ...maintenanceActions({ complete: true, manage: true }),
  ...financeActions({
    close: true,
    correct: true,
    publish: true,
    record: true,
    submitOrApprove: true,
  }),
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
  action("documents", "Documents", "/documents", ["files"]),
  action("import", "Import data", "/import", ["csv", "upload"]),
  action("settings", "Organization settings", "/settings"),
  action("settings-access", "Workspace Access", "/settings/access", [
    "access",
    "permissions",
    "users",
    "roles",
  ]),
] satisfies readonly WorkspaceSearchAction[];

export function getWorkspaceSearchScopes({
  isSuperAdmin,
  permissionKeys,
}: WorkspaceSearchAuthority): readonly WorkspaceSearchScope[] {
  if (isSuperAdmin) return ADMIN_SCOPES;

  const scopes: WorkspaceSearchScope[] = [];
  if (permissionKeys.has("properties.view")) {
    scopes.push("properties", "units");
  }
  if (permissionKeys.has("people.view")) scopes.push("people");
  if (permissionKeys.has("leases.view")) scopes.push("leases");
  if (permissionKeys.has("maintenance.view")) scopes.push("tasks");
  return scopes;
}

export function getWorkspaceSearchActions({
  isSuperAdmin,
  permissionKeys,
}: WorkspaceSearchAuthority): readonly WorkspaceSearchAction[] {
  if (isSuperAdmin) return ADMIN_ACTIONS;

  const actions: WorkspaceSearchAction[] = [];
  if (permissionKeys.has("properties.view")) actions.push(...propertyActions());
  if (permissionKeys.has("people.view")) actions.push(...peopleActions());
  if (permissionKeys.has("leases.view")) actions.push(...leaseActions());
  if (permissionKeys.has("maintenance.view")) {
    actions.push(
      ...maintenanceActions({
        complete: permissionKeys.has("maintenance.complete"),
        manage:
          permissionKeys.has("maintenance.create_assign") ||
          permissionKeys.has("maintenance.review"),
      }),
    );
  }
  if (permissionKeys.has("finance.view")) {
    actions.push(
      ...financeActions({
        close: permissionKeys.has("finance.close_periods"),
        correct: permissionKeys.has("finance.correct_records"),
        publish: permissionKeys.has("finance.publish"),
        record: permissionKeys.has("finance.record_payments"),
        submitOrApprove:
          permissionKeys.has("finance.submit_expenses") ||
          permissionKeys.has("finance.approve_expenses") ||
          permissionKeys.has("finance.correct_records"),
      }),
    );
  }
  return actions;
}

function propertyActions() {
  return [
    action("properties", "Properties", "/properties", ["buildings"]),
    action("units", "Units", "/units", ["apartments"]),
  ];
}

function peopleActions() {
  return [
    action("people", "People", "/people", ["contacts"]),
    action("tenants", "Tenants", "/tenants"),
    action("owners", "Owners", "/owners"),
    action("staff", "Staff", "/staff", ["team"]),
    action("vendors", "Vendors", "/vendors"),
  ];
}

function leaseActions() {
  return [action("leases", "Leases", "/leases")];
}

function maintenanceActions({
  complete,
  manage,
}: {
  complete: boolean;
  manage: boolean;
}) {
  const actions = [
    action("maintenance", "Cases", "/maintenance", [
      "maintenance",
      "work orders",
    ]),
  ];
  if (complete) {
    actions.push(action("tasks", "Tasks", "/tasks", ["assignments", "my work"]));
  }
  if (manage) {
    actions.push(
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
    );
  }
  return actions;
}

function financeActions({
  close,
  correct,
  publish,
  record,
  submitOrApprove,
}: {
  close: boolean;
  correct: boolean;
  publish: boolean;
  record: boolean;
  submitOrApprove: boolean;
}) {
  const actions = [
    action("finance-work", "Finance work", "/finance", ["finance", "open work"]),
  ];
  if (record) {
    actions.push(
      action("rent-income", "Rent", "/rent-income", [
        "income",
        "payments",
        "tenant invoices",
      ]),
    );
  }
  if (submitOrApprove) {
    actions.push(
      action("bills-expenses", "Expenses", "/bills-expenses", [
        "bills",
        "charges",
      ]),
    );
  }
  actions.push(
    action("balances", "Balances", "/balances", [
      "owners",
      "customers",
      "property accounts",
    ]),
  );
  if (correct || close) {
    actions.push(action("ledger", "Ledger", "/ledger"));
  }
  if (correct) {
    actions.push(action("petty-cash", "Petty Cash", "/petty-cash"));
  }
  if (publish) {
    actions.push(action("reports", "Reports", "/reports"));
  }
  return actions;
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
