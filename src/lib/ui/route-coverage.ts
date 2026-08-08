import routeCoverageJson from "../../../config/ui-route-coverage.json";
import type { WorkspaceRole } from "@/lib/auth/context";

export type UiPhase = 2 | 3 | 4 | 5 | 6;
export type UiRole =
  | "public"
  | "unlinked"
  | "admin"
  | "staff"
  | "maintenance"
  | WorkspaceRole;
export type UiSurface = "public" | "auth" | "workspace" | "detail" | "settings" | "redirect";

export interface UiRouteContract {
  route: string;
  source: string;
  phase: UiPhase;
  surface: UiSurface;
  roles: UiRole[];
  states: string[];
}

export const uiPersonaWorkspaceRoles: Readonly<
  Record<UiRole, readonly WorkspaceRole[]>
> = {
  admin: ["super_admin"],
  finance_manager: ["finance_manager"],
  finance_member: ["finance_member"],
  maintenance: ["operations_member"],
  operations_manager: ["operations_manager"],
  operations_member: ["operations_member"],
  public: [],
  staff: ["operations_manager", "operations_member"],
  super_admin: ["super_admin"],
  unlinked: [],
};

export const uiRouteCoverage =
  routeCoverageJson as unknown as UiRouteContract[];

const contractsByRoute = new Map(
  uiRouteCoverage.map((contract) => [contract.route, contract]),
);

export function getUiRouteContract(route: string) {
  return contractsByRoute.get(route);
}

export function getUiRoutesForPhase(phase: UiPhase) {
  return uiRouteCoverage.filter((contract) => contract.phase === phase);
}
