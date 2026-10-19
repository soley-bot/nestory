import type { PermissionKey } from "./permission-catalog";

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
