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

export function createSessionStartEvidence(role, destination) {
  return {
    chain: ["/workspace", "Open workspace"],
    destination,
    role,
    status: "passed",
  };
}

export function buildDeniedGlobalEntryChecks(contract, role) {
  const checks = [];

  for (const route of contract.routes) {
    if (route.roleAccess[role]?.[0] !== "inaccessible") continue;

    const authorizedGlobalEntries = new Set(
      contract.roles.flatMap((authorizedRole) => {
        const [classification, entryId] = route.roleAccess[authorizedRole] ?? [];
        return classification === "global" ? [entryId] : [];
      }),
    );

    if (authorizedGlobalEntries.size > 1) {
      throw new Error(`${route.route} has multiple authorized global entries`);
    }
    const [entryId] = authorizedGlobalEntries;
    if (!entryId) continue;

    const entry = contract.entries[entryId];
    if (entry?.kind !== "global" || !entry.href) {
      throw new Error(`${entryId} must declare its global href`);
    }
    if (entry.href !== route.route) {
      throw new Error(
        `${entryId} href ${entry.href} does not match ${route.route}`,
      );
    }
    checks.push({ entryId, href: entry.href, route: route.route });
  }

  return checks;
}

export function findForbiddenGlobalEntries(contract, role, visibleHrefs) {
  const visible = new Set(visibleHrefs);
  return buildDeniedGlobalEntryChecks(contract, role).filter((check) =>
    visible.has(check.href),
  );
}

export function validateDiscoverabilityEvidence(contract, evidence) {
  const issues = [];
  const plan = buildDiscoverabilityPlan(contract);
  const expectedJourneyIds = new Set(plan.map((journey) => journey.id));
  const journeyById = new Map(
    (evidence?.journeys ?? []).map((journey) => [journey.id, journey]),
  );

  if (
    evidence?.journeys?.length !== plan.length ||
    journeyById.size !== plan.length ||
    evidence?.passed !== plan.length ||
    evidence?.total !== plan.length
  ) {
    issues.push(`evidence must contain exactly ${plan.length} passed journeys`);
  }

  for (const journeyId of expectedJourneyIds) {
    const journey = journeyById.get(journeyId);
    if (!journey || journey.status !== "passed") {
      issues.push(`${journeyId}: passed journey evidence is missing`);
      continue;
    }
    if (!Array.isArray(journey.chain) || journey.chain.length === 0) {
      issues.push(`${journeyId}: visible shell/context chain is missing`);
    } else if (
      journey.chain.includes("/workspace") ||
      journey.chain.includes("Open workspace")
    ) {
      issues.push(`${journeyId}: journey must not repeat the workspace session start`);
    }
  }

  if (evidence?.sessionStarts?.length !== contract.roles.length) {
    issues.push(`evidence must contain exactly ${contract.roles.length} role session starts`);
  }
  if (evidence?.deniedGlobalAbsence?.length !== contract.roles.length) {
    issues.push(`evidence must contain exactly ${contract.roles.length} denied-global results`);
  }

  for (const role of contract.roles) {
    const starts = (evidence?.sessionStarts ?? []).filter(
      (session) => session.role === role,
    );
    if (
      starts.length !== 1 ||
      starts[0].status !== "passed" ||
      JSON.stringify(starts[0].chain) !==
        JSON.stringify(["/workspace", "Open workspace"]) ||
      !starts[0].destination ||
      ["/login", "/no-access", "/workspace"].includes(starts[0].destination)
    ) {
      issues.push(`${role}: exactly one passed workspace session start is required`);
    }

    const absence = (evidence?.deniedGlobalAbsence ?? []).filter(
      (result) => result.role === role,
    );
    const expectedChecks = buildDeniedGlobalEntryChecks(contract, role).length;
    if (
      absence.length !== 1 ||
      absence[0].status !== "passed" ||
      absence[0].checked !== expectedChecks
    ) {
      issues.push(`${role}: denied-global absence evidence is incomplete`);
    }
  }

  const expectedDenials = Object.entries(directDenialRoutes).filter(
    ([, route]) => route,
  );
  if (evidence?.denials?.length !== expectedDenials.length) {
    issues.push(`evidence must contain exactly ${expectedDenials.length} direct denials`);
  }
  for (const [role, route] of expectedDenials) {
    const match = (evidence?.denials ?? []).find(
      (denial) => denial.role === role && denial.route === route,
    );
    if (match?.status !== "passed") {
      issues.push(`${role}: direct denial ${route} is missing`);
    }
  }

  return issues;
}
