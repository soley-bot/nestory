export const fixtureRoleViewports = [
  { height: 900, name: "desktop", width: 1440 },
  { height: 720, name: "laptop", width: 1280 },
  { height: 844, name: "phone", width: 390 },
];

export const fixtureRoleJourneys = [
  {
    email: "nestory@gmail.com",
    expectedRecord: "GDN-CRT / Garden Court",
    route: "/overview",
  },
  {
    email: "finance.manager@nestory.com",
    expectedRecord: "Maintenance cost",
    route: "/finance",
  },
  {
    email: "finance.member@nestory.com",
    expectedAction: {
      heading: "Record paid cost",
      href: "/bills-expenses?action=create",
      label: "Record paid cost",
    },
    expectedRecord: "Khmer Home Services",
    route: "/finance",
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
  "action did not complete",
  "login did not complete",
  "record not visible",
  "route did not load",
]);

export function formatFixtureRoleJourneyFailure(journey, reason) {
  const safeReason = safeFailureReasons.has(reason) ? reason : "journey failed";

  return `${journey.email} ${journey.route} expected ${journey.expectedRecord}: ${safeReason}`;
}
