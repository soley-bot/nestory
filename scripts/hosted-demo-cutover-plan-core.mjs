import { createHash } from "node:crypto";

export const CUTOVER_EXPECTATIONS = Object.freeze({
  projectRef: "pfvmztxktkwyewvxfgot",
  projectSlug: "nestory",
  targetOrganizationId: "1221152a-3a7d-48f6-a109-45f2b2173813",
  migrationHead: "20260728120841_authoritative_lease_terms_and_rent_policy",
});

export const REQUIRED_TARGET_COUNTS = Object.freeze([
  "properties",
  "units",
  "people",
  "leases",
  "financeIncomeItems",
  "financeExpenseItems",
  "financeReceipts",
  "financePayments",
  "tasks",
  "documents",
  "assetPhotos",
  "organizationMembers",
  "organizationInvitations",
]);

const REQUIRED_INVITATION_STATUSES = Object.freeze([
  "pending",
  "accepted",
  "revoked",
]);

function fail(message) {
  throw new Error(`Cutover inventory rejected: ${message}`);
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value
      .map(canonicalize)
      .sort((left, right) => {
        const leftJson = JSON.stringify(left);
        const rightJson = JSON.stringify(right);
        return leftJson < rightJson ? -1 : leftJson > rightJson ? 1 : 0;
      });
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function assertNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    fail(`${label} must be a non-negative integer`);
  }
}

export function validateInventory(inventory) {
  if (!inventory || typeof inventory !== "object" || Array.isArray(inventory)) {
    fail("the root value must be an object");
  }

  if (inventory.projectRef !== CUTOVER_EXPECTATIONS.projectRef) {
    fail(`projectRef must equal ${CUTOVER_EXPECTATIONS.projectRef}`);
  }
  if (inventory.projectSlug !== CUTOVER_EXPECTATIONS.projectSlug) {
    fail(`projectSlug must equal ${CUTOVER_EXPECTATIONS.projectSlug}`);
  }
  if (inventory.migrationHead !== CUTOVER_EXPECTATIONS.migrationHead) {
    fail(`migrationHead must equal ${CUTOVER_EXPECTATIONS.migrationHead}`);
  }
  if (!Array.isArray(inventory.organizations) || inventory.organizations.length === 0) {
    fail("organizations must be a non-empty array");
  }

  const organizationIds = new Set();
  for (const organization of inventory.organizations) {
    if (
      !organization ||
      typeof organization.id !== "string" ||
      typeof organization.name !== "string" ||
      typeof organization.slug !== "string"
    ) {
      fail("every organization requires string id, name, and slug fields");
    }
    if (organizationIds.has(organization.id)) {
      fail(`organization id ${organization.id} is duplicated`);
    }
    organizationIds.add(organization.id);
  }

  const targets = inventory.organizations.filter(
    (organization) =>
      organization.id === CUTOVER_EXPECTATIONS.targetOrganizationId,
  );
  if (targets.length !== 1) {
    fail(
      `exactly one organization must match ${CUTOVER_EXPECTATIONS.targetOrganizationId}`,
    );
  }

  const target = targets[0];
  if (!target.tableCounts || typeof target.tableCounts !== "object") {
    fail("the target organization requires tableCounts");
  }
  for (const table of REQUIRED_TARGET_COUNTS) {
    assertNonNegativeInteger(target.tableCounts[table], `tableCounts.${table}`);
  }

  if (
    !target.invitationsByStatus ||
    typeof target.invitationsByStatus !== "object" ||
    Array.isArray(target.invitationsByStatus)
  ) {
    fail("the target organization requires invitationsByStatus");
  }
  for (const status of REQUIRED_INVITATION_STATUSES) {
    if (!(status in target.invitationsByStatus)) {
      fail(`invitationsByStatus.${status} is required`);
    }
    assertNonNegativeInteger(
      target.invitationsByStatus[status],
      `invitationsByStatus.${status}`,
    );
  }
  for (const [status, count] of Object.entries(target.invitationsByStatus)) {
    if (!REQUIRED_INVITATION_STATUSES.includes(status)) {
      fail(`unsupported invitation status ${status}`);
    }
    assertNonNegativeInteger(count, `invitationsByStatus.${status}`);
  }
  const invitationStatusTotal = REQUIRED_INVITATION_STATUSES.reduce(
    (total, status) => total + target.invitationsByStatus[status],
    0,
  );
  if (
    invitationStatusTotal !== target.tableCounts.organizationInvitations
  ) {
    fail("invitation status total must equal tableCounts.organizationInvitations");
  }

  if (
    !Array.isArray(target.adminUserIds) ||
    target.adminUserIds.length === 0 ||
    target.adminUserIds.some((id) => typeof id !== "string" || !id)
  ) {
    fail("the target organization requires at least one adminUserId");
  }

  return {
    target,
    preservedOrganizations: inventory.organizations.filter(
      (organization) => organization.id !== target.id,
    ),
  };
}

export function buildCutoverManifest(inventory, referenceDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(referenceDate)) {
    fail("referenceDate must use YYYY-MM-DD");
  }
  const parsedReferenceDate = new Date(`${referenceDate}T00:00:00.000Z`);
  if (
    Number.isNaN(parsedReferenceDate.valueOf()) ||
    parsedReferenceDate.toISOString().slice(0, 10) !== referenceDate
  ) {
    fail("referenceDate must be a valid calendar date");
  }

  const { target, preservedOrganizations } = validateInventory(inventory);
  const inventorySha256 = createHash("sha256")
    .update(JSON.stringify(canonicalize(inventory)))
    .digest("hex");

  return {
    schemaVersion: 1,
    mode: "planning-only",
    executeSupported: false,
    generatedAt: new Date().toISOString(),
    referenceDate,
    inventorySha256,
    project: {
      ref: inventory.projectRef,
      slug: inventory.projectSlug,
      migrationHead: inventory.migrationHead,
    },
    targetOrganization: {
      id: target.id,
      name: target.name,
      slug: target.slug,
      tableCounts: target.tableCounts,
      invitationsByStatus: target.invitationsByStatus,
      adminUserIds: [...target.adminUserIds].sort(),
    },
    preservedOrganizations: [...preservedOrganizations]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((organization) => ({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
      })),
    requiredSnapshot: {
      scope: "target organization plus target-linked auth identities",
      includes: [
        "target organization table rows",
        "organization memberships and invitations grouped by status",
        "target admin user and auth identity mappings",
        "storage object metadata referenced by target rows",
      ],
      excludes: [
        "non-target organization rows",
        "plaintext credentials",
        "service-role keys",
      ],
    },
    actionPlan: [
      "re-read the hosted inventory and verify its SHA-256 fingerprint",
      "create and independently validate a restorable target-scoped snapshot",
      "recheck project ref, project slug, migration head, target organization id, and preserved organization ids",
      "place only the target organization into a maintenance window",
      "delete only target-owned demo-domain rows in foreign-key-safe order",
      "load the approved deterministic fixture with the chosen reference date",
      "preserve and relink approved target admins; reconcile invitations by status",
      "run tenant-isolation, auth, finance, lease, maintenance, and storage verification",
      "abort and restore the snapshot on any failed invariant",
    ],
    approvalsRequired: [
      "explicit hosted cutover approval",
      "snapshot restoration proof",
      "final manifest review by a second operator",
    ],
  };
}
