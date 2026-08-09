import assert from "node:assert/strict";
import test from "node:test";

import {
  fixtureRoleJourneys,
  formatFixtureRoleJourneyFailure,
} from "./smoke-fixture-role-journeys-core.mjs";

test("defines the five local fixture role journeys with stable story records", () => {
  assert.deepEqual(fixtureRoleJourneys, [
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
      route: "/maintenance",
    },
  ]);
});

test("formats a concise diagnostic without accepting credential data", () => {
  assert.equal(
    formatFixtureRoleJourneyFailure(fixtureRoleJourneys[1], "record not visible"),
    "finance.manager@nestory.com /bills-expenses expected Ref: GDN-PUMP-2088: record not visible",
  );
  assert.equal(
    formatFixtureRoleJourneyFailure(fixtureRoleJourneys[1], "password=secret"),
    "finance.manager@nestory.com /bills-expenses expected Ref: GDN-PUMP-2088: journey failed",
  );
});
