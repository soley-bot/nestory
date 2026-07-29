import assert from "node:assert/strict";
import test from "node:test";

import { transformTargetOrgDump } from "./target-org-dump-core.mjs";

const SOURCE_ORG = "00000000-0000-0000-0000-000000000001";
const TARGET_ORG = "1221152a-3a7d-48f6-a109-45f2b2173813";
const SOURCE_ADMIN = "00000000-0000-0000-0000-000000000101";
const TARGET_ADMIN = "f61bdcfe-dbdf-40c6-8e47-58b1d01859b2";

test("filters a pg_dump to one organization and remaps exact identities", () => {
  const source = [
    "SET statement_timeout = 0;",
    "",
    'COPY "public"."organizations" ("id", "name", "slug") FROM stdin;',
    `${SOURCE_ORG}\tSample Property Group\tsample-property-group`,
    "ca7be424-f9b1-44ab-97eb-9cbb387653fa\tDemo Company\tdemo-company",
    "\\.",
    "",
    'COPY "public"."properties" ("id", "organization_id", "name", "created_by") FROM stdin;',
    `10000000-0000-0000-0000-000000000001\t${SOURCE_ORG}\tCentral Residence\t${SOURCE_ADMIN}`,
    "20000000-0000-0000-0000-000000000001\tca7be424-f9b1-44ab-97eb-9cbb387653fa\tOther Property\t99999999-9999-9999-9999-999999999999",
    "\\.",
    "",
  ].join("\n");

  const result = transformTargetOrgDump(source, {
    sourceOrganizationId: SOURCE_ORG,
    targetOrganizationId: TARGET_ORG,
    identityMap: new Map([[SOURCE_ADMIN, TARGET_ADMIN]]),
  });

  assert.match(result.sql, new RegExp(TARGET_ORG, "g"));
  assert.match(result.sql, new RegExp(TARGET_ADMIN, "g"));
  assert.doesNotMatch(result.sql, /Demo Company|Other Property/);
  assert.deepEqual(result.tableCounts, {
    organizations: 1,
    properties: 1,
  });
});

test("can omit preserved hosted tables from a fresh insertion payload", () => {
  const source = [
    "COPY public.organization_members (id, organization_id, user_id) FROM stdin;",
    `a0000000-0000-0000-0000-000000000001\t${SOURCE_ORG}\t${SOURCE_ADMIN}`,
    "\\.",
    "COPY public.properties (id, organization_id, name) FROM stdin;",
    `10000000-0000-0000-0000-000000000001\t${SOURCE_ORG}\tCentral Residence`,
    "\\.",
    "",
  ].join("\n");

  const result = transformTargetOrgDump(source, {
    sourceOrganizationId: SOURCE_ORG,
    targetOrganizationId: TARGET_ORG,
    excludedTables: new Set(["organization_members"]),
  });

  assert.doesNotMatch(result.sql, /organization_members/);
  assert.match(result.sql, /Central Residence/);
  assert.deepEqual(result.tableCounts, { properties: 1 });
});

test("fails closed when a populated public table has no organization boundary", () => {
  const source = [
    "COPY public.unexpected_global_table (id, payload) FROM stdin;",
    "1\tmust-not-leak",
    "\\.",
    "",
  ].join("\n");

  assert.throws(
    () =>
      transformTargetOrgDump(source, {
        sourceOrganizationId: SOURCE_ORG,
        targetOrganizationId: TARGET_ORG,
      }),
    /does not expose an organization_id column/,
  );
});

test("rejects output that still contains an unmapped local auth identity", () => {
  const source = [
    "COPY public.tasks (id, organization_id, assigned_to) FROM stdin;",
    `70000000-0000-0000-0000-000000000001\t${SOURCE_ORG}\t00000000-0000-0000-0000-000000000601`,
    "\\.",
    "",
  ].join("\n");

  assert.throws(
    () =>
      transformTargetOrgDump(source, {
        sourceOrganizationId: SOURCE_ORG,
        targetOrganizationId: TARGET_ORG,
        forbiddenIdentityPattern:
          /00000000-0000-0000-0000-000000000(?:101|501|601)/,
      }),
    /unmapped local auth identity/,
  );
});
