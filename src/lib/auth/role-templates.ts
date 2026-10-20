import type { PermissionKey } from "./permission-catalog";

/** Optional draft presets only; never used to resolve existing role authority. */
export const PROPERTY_FINANCE_TEMPLATE = {
  name: "Property & Finance",
  permissions: [
    "properties.view", "properties.write", "properties.archive",
    "people.view", "people.write", "people.archive",
    "leases.view", "leases.prepare", "leases.activate", "leases.change_terms", "leases.close", "leases.archive",
    "finance.view", "finance.record_payments", "finance.submit_expenses",
    "finance.approve_expenses", "finance.post_expenses", "finance.correct_expenses", "finance.correct_records",
  ] satisfies PermissionKey[],
} as const;

export const OPERATIONS_TEMPLATE = {
  name: "Operations",
  permissions: [
    "properties.view",
    "maintenance.view", "maintenance.create_assign", "maintenance.complete", "maintenance.review",
  ] satisfies PermissionKey[],
} as const;

/** Draft only: choosing a template never creates a role or assigns a member. */
export const PROPERTY_MANAGER_TEMPLATE = {
  name: "Property Manager",
  permissions: [
    "properties.view", "properties.write",
    "people.view", "people.write",
    "leases.view", "leases.prepare", "leases.activate", "leases.change_terms", "leases.close",
    "finance.view", "finance.record_payments", "finance.submit_expenses",
    "finance.post_expenses", "finance.correct_expenses",
    "maintenance.view", "maintenance.create_assign", "maintenance.complete", "maintenance.review",
  ] satisfies PermissionKey[],
} as const;
