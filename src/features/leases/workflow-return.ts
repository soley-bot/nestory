import { safeLoginNextPath } from "@/lib/auth/login-redirect";
import { reportReturnHref } from "@/features/reports/report-return";

const workflowPath = /^\/(?:finance|rent-income|bills-expenses|leases|properties|units)(?:\/[a-zA-Z0-9_-]+)*$/;
const contextKeys = new Set(["view", "section", "page", "q", "due", "overdueDays", "status", "sort", "property", "expenseMonth", "month", "propertyId", "unitId", "ownerPersonId", "archiveState", "tenantPersonId", "leaseId"]);
const setupContextKeys = new Set(["step", "ownerId", "tenantId"]);

export function workflowReturnHref(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length > 2000) return;
  const report = reportReturnHref(value);
  if (report) return report;
  const safe = safeLoginNextPath(value);
  if (!workflowPath.test(safe.split("?", 1)[0])) return;
  const url = new URL(safe, "https://nestory.invalid");
  const reportOrigin = reportReturnHref(url.searchParams.get("returnTo"));
  for (const key of [...url.searchParams.keys()]) {
    if (!contextKeys.has(key) && !(url.pathname === "/properties/setup" && setupContextKeys.has(key))) {
      url.searchParams.delete(key);
    }
  }
  if (reportOrigin) url.searchParams.set("returnTo", reportOrigin);
  return `${url.pathname}${url.search}`;
}
