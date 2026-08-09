export const fixtureRoleJourneys = [
  {
    email: "nestory@gmail.com",
    expectedRecord: "GDN-CRT / Garden Court",
    route: "/overview",
  },
  {
    email: "finance.manager@nestory.com",
    expectedRecord: "Ref: GDN-PUMP-2088",
    expectedRecordParts: [
      "Maintenance cost",
      "Garden Court",
      "Ref: GDN-PUMP-2088",
    ],
    route: "/bills-expenses",
  },
  {
    email: "finance.member@nestory.com",
    expectedRecord: "Pisey Touch",
    route: "/rent-income",
  },
  {
    email: "operations.manager@nestory.com",
    expectedRecord: "Riverside drainage access blocked",
    route: "/maintenance",
  },
  {
    email: "operations.member@nestory.com",
    expectedRecord: "Garden Court corridor light repair",
    route: "/tasks",
  },
];

const safeFailureReasons = new Set([
  "access denied",
  "login did not complete",
  "record not visible",
  "route did not load",
]);

export function formatFixtureRoleJourneyFailure(journey, reason) {
  const safeReason = safeFailureReasons.has(reason) ? reason : "journey failed";

  return `${journey.email} ${journey.route} expected ${journey.expectedRecord}: ${safeReason}`;
}
