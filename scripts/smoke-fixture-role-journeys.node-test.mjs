import assert from "node:assert/strict";
import test from "node:test";

import {
  fixtureRoleJourneys,
  fixtureRoleViewports,
  formatFixtureRoleJourneyFailure,
} from "./smoke-fixture-role-journeys-core.mjs";

test("uses the three Task 6 acceptance viewports", () => {
  assert.deepEqual(fixtureRoleViewports, [
    { height: 900, name: "desktop", width: 1440 },
    { height: 720, name: "laptop", width: 1280 },
    { height: 844, name: "phone", width: 390 },
  ]);
});

test("defines the five local fixture role journeys with stable story records", () => {
  assert.deepEqual(fixtureRoleJourneys, [
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
  ]);
});

test("formats a concise diagnostic without accepting credential data", () => {
  assert.equal(
    formatFixtureRoleJourneyFailure(fixtureRoleJourneys[1], "record not visible"),
    "finance.manager@nestory.com /finance expected Maintenance cost: record not visible",
  );
  assert.equal(
    formatFixtureRoleJourneyFailure(fixtureRoleJourneys[1], "password=secret"),
    "finance.manager@nestory.com /finance expected Maintenance cost: journey failed",
  );
  assert.equal(
    formatFixtureRoleJourneyFailure(
      fixtureRoleJourneys[2],
      "action did not complete",
    ),
    "finance.member@nestory.com /finance expected Khmer Home Services: action did not complete",
  );
});
