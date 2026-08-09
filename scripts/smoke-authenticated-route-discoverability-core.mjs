export const fixtureRoleEmails = Object.freeze({
  finance_manager: "finance.manager@nestory.com",
  finance_member: "finance.member@nestory.com",
  operations_manager: "operations.manager@nestory.com",
  operations_member: "operations.member@nestory.com",
  super_admin: "nestory@gmail.com",
});

export const directDenialRoutes = Object.freeze({
  finance_manager: "/properties",
  finance_member: "/reports",
  operations_manager: "/finance",
  operations_member: "/maintenance",
  super_admin: null,
});

export function buildDiscoverabilityPlan(contract) {
  const journeys = [];

  for (const role of contract.roles) {
    for (const route of contract.routes) {
      const [classification, entryId, idOrReason] = route.roleAccess[role];
      if (classification === "inaccessible") continue;

      journeys.push({
        classification,
        entryId,
        id: idOrReason,
        role,
        route: route.route,
      });
    }
  }

  return journeys;
}

export function createPassedJourneyEvidence(id, chain) {
  return {
    chain: [...chain],
    id,
    status: "passed",
  };
}
