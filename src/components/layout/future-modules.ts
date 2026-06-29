export type PlannedPageStatus = "Planned" | "Later";

export type FutureModule = {
  name: string;
  path: string;
  status: PlannedPageStatus;
  group: string;
  summary: string;
  reason: string;
  recordRoomDependency: string;
};

export const FUTURE_MODULES: FutureModule[] = [
  {
    name: "Communications",
    path: "/communications",
    status: "Planned",
    group: "Operations",
    summary:
      "Tenant, owner, and internal messages organized around the records they affect.",
    reason:
      "Messaging is useful only when it can be tied back to the right property, unit, person, lease, or maintenance record.",
    recordRoomDependency:
      "Needs stable people records, relationship context, documents, and linked activity history.",
  },
  {
    name: "Tenant portal",
    path: "/tenant-portal",
    status: "Later",
    group: "External access",
    summary:
      "A renter-facing place for balances, documents, requests, and messages.",
    reason:
      "External access should wait until internal tenant, lease, payment, maintenance, and messaging flows are reliable.",
    recordRoomDependency:
      "Needs tenant identity, lease context, balances, requests, documents, and safe access boundaries.",
  },
  {
    name: "Workflows",
    path: "/workflows",
    status: "Later",
    group: "Automation",
    summary:
      "Repeatable property operations once the underlying modules are stable.",
    reason:
      "Automation should codify proven workflows, not invent process before operators have used the core screens.",
    recordRoomDependency:
      "Needs mature activity history, statuses, ownership, due dates, notifications, and safe rollback paths.",
  },
];

export const FUTURE_MODULE_PATHS = FUTURE_MODULES.map((module) => module.path);

export function getFutureModulePlan(title: string) {
  return FUTURE_MODULES.find(
    (module) => module.name.toLowerCase() === title.toLowerCase(),
  );
}
