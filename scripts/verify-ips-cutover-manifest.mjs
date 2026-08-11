import { createHash } from "node:crypto";

const importTypes = ["leases", "people", "properties", "units"];
const ownerComponents = [
  "ips_due_to_owner",
  "ips_held_owner_cash",
  "owner_due_to_ips",
  "security_deposit_custody",
];
const moneyPattern = /^(0|[1-9][0-9]{0,11})\.[0-9]{2}$/;

export function canonicalizeIpsCutoverManifest(value) {
  return JSON.stringify(sortJson(value));
}

export function hashIpsCutoverManifest(value) {
  return createHash("sha256")
    .update(canonicalizeIpsCutoverManifest(value), "utf8")
    .digest("hex");
}

export function inspectIpsCutoverManifest(value) {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error("IPS cutover manifest schemaVersion must be 1.");
  }
  if (!/^\d{4}-\d{2}-01$/.test(String(value.authorityStartDate))) {
    throw new Error("IPS cutover authorityStartDate must be a month start.");
  }
  if (!String(value.dataOwner).startsWith("REDACTED-")) {
    throw new Error("Local IPS cutover data owner must be redacted.");
  }
  const runs = requireArray(value.importRuns, "importRuns");
  const tenantBalances = requireArray(
    value.tenantOpeningBalances,
    "tenantOpeningBalances",
  );
  const openings = requireArray(
    value.ownerOpeningComponents,
    "ownerOpeningComponents",
  );
  const exceptions = requireArray(value.signedExceptions, "signedExceptions");
  const actualImportTypes = runs.map((run) => String(run.importType)).sort();
  if (JSON.stringify(actualImportTypes) !== JSON.stringify(importTypes)) {
    throw new Error("Manifest must contain one import claim for each core type.");
  }
  for (const run of runs) {
    if (!/^[0-9a-f]{64}$/.test(String(run.sourceClaimHash))) {
      throw new Error("Every import run requires one immutable source claim hash.");
    }
  }
  const actualComponents = openings.map((opening) => String(opening.component)).sort();
  if (JSON.stringify(actualComponents) !== JSON.stringify(ownerComponents)) {
    throw new Error("Manifest must contain all four owner opening components.");
  }
  const sourceKeys = [
    ...runs,
    ...tenantBalances,
    ...openings,
    ...exceptions,
  ].map((item) => String(item.sourceKey));
  if (new Set(sourceKeys).size !== sourceKeys.length) {
    throw new Error("Cutover source keys must be unique.");
  }
  const selectedRentMonths = tenantBalances
    .flatMap((balance) => requireArray(balance.selectedRentMonths, "selectedRentMonths"))
    .map(String)
    .sort();
  if (new Set(selectedRentMonths).size !== selectedRentMonths.length) {
    throw new Error("Selected rent months must be explicit and unique.");
  }
  const tenantOpeningTotal = centsToMoney(
    tenantBalances.reduce(
      (total, balance) => total + moneyToCents(balance.expectedBalance),
      0n,
    ),
  );

  return {
    authorityStartDate: String(value.authorityStartDate),
    dataOwner: String(value.dataOwner),
    importTypes: actualImportTypes,
    ownerComponentCount: openings.length,
    selectedRentMonths,
    signedExceptionCount: exceptions.length,
    tenantOpeningTotal,
  };
}

function moneyToCents(value) {
  const text = String(value);
  if (!moneyPattern.test(text)) {
    throw new Error(`Noncanonical cutover money: ${text}`);
  }
  const [whole, cents] = text.split(".");
  return BigInt(whole) * 100n + BigInt(cents);
}

function centsToMoney(value) {
  return `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
}

function requireArray(value, label) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`);
  return value;
}

function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (!isRecord(value)) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortJson(value[key])]),
  );
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
