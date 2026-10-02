import { WORKSPACE_ENTRY_PATH } from "@/lib/auth/workspace-entry";

const WORKSPACE_PATH = /^\/(?:workspace|overview|properties|units|people|tenants|owners|vendors|staff|leases|finance|rent-income|bills-expenses|balances|petty-cash|ledger|reports|maintenance|tasks|work-orders|inspections|recurring-tasks|documents|import|account|settings|users-roles|timeline|property-timeline|financial-timeline|maintenance-timeline)(?:\/[a-zA-Z0-9_-]+)*$/;
const INVITATION_PATH = /^\/accept-invite\?invitation=[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function safeLoginNextPath(value: string | null | undefined): string {
  if (!value || value.length > 4096 || /[\u0000-\u0020\u007f\\#]/.test(value)) {
    return WORKSPACE_ENTRY_PATH;
  }

  if (INVITATION_PATH.test(value)) return value;
  if (!WORKSPACE_PATH.test(value.split("?", 1)[0])) return WORKSPACE_ENTRY_PATH;

  return value.replaceAll(";", "%3B");
}

export function getLoginPath(next?: string | null) {
  const destination = safeLoginNextPath(next);
  return destination === WORKSPACE_ENTRY_PATH
    ? "/login"
    : `/login?${new URLSearchParams({ next: destination })}`;
}
