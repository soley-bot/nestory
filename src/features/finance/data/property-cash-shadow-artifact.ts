import { createHash } from "node:crypto";

import {
  serializePropertyCashMovementTotals,
  summarizePropertyCashMovements,
} from "@/features/finance/data/property-cash-events.totals";
import { formatExactCents } from "@/features/finance/data/property-cash-events.money";
import type { PropertyCashEvent } from "@/features/finance/data/property-cash-events.types";
import type {
  PropertyCashParityIdentity,
  PropertyCashParityRecord,
} from "@/features/finance/data/property-cash-shadow-parity";

type ShadowScope = {
  currency: "USD";
  organizationId: string;
  periodEnd: string;
  periodStart: string;
  propertyId: string;
};

export async function buildPropertyCashShadowArtifact(input: {
  canonicalEvents: PropertyCashEvent[];
  contractVersion: "property_cash_events_v1";
  migrationIdentity: string;
  parityRecords: PropertyCashParityRecord[];
  repositoryDirty: boolean;
  repositorySha: string;
  schemaIdentity: string;
  scope: ShadowScope;
  sourceWatermark: Record<string, unknown>;
}) {
  const canonicalEvents = input.canonicalEvents.toSorted((first, second) =>
    first.eventKey.localeCompare(second.eventKey),
  );
  const parityRecords = input.parityRecords.toSorted(compareParityRecords);
  const totals = await summarizePropertyCashMovements(toAsync(canonicalEvents));
  const unresolvedEvents = canonicalEvents.filter(
    (event) => event.requiresResolution,
  );
  const artifact = normalizeJson({
    canonical: {
      eventCount: canonicalEvents.length,
      sourceFamilyCounts: countBy(
        canonicalEvents.map((event) => event.sourceType),
      ),
      totals: serializePropertyCashMovementTotals(totals),
    },
    contractVersion: input.contractVersion,
    excludedIdentities: collectIdentities(parityRecords, "excluded"),
    includedIdentities: collectIdentities(parityRecords, "included"),
    migrationIdentity: input.migrationIdentity,
    parityRecords,
    projectionOnlyIdentities: canonicalEvents
      .filter((event) => event.projectionStatus !== null)
      .map(sourceIdentity),
    repository: {
      dirty: input.repositoryDirty,
      sha: input.repositorySha,
    },
    residualHeaderEvents: canonicalEvents
      .filter(
        (event) =>
          event.sourceType === "receipt_header_residual" ||
          event.sourceType === "payment_header_residual",
      )
      .map((event) => ({
        amount: cents(event.amountCents),
        categoryCode: event.categoryCode,
        eventDate: event.eventDate,
        eventKey: event.eventKey,
        resolutionCodes: event.resolutionCodes,
        sourceId: event.sourceId,
        sourceType: event.sourceType,
      })),
    resolutionCodeCounts: countBy(
      unresolvedEvents.flatMap((event) => event.resolutionCodes),
    ),
    schemaIdentity: input.schemaIdentity,
    scope: input.scope,
    sourceWatermark: input.sourceWatermark,
    unresolvedIdentities: [
      ...unresolvedEvents.map(sourceIdentity),
      ...collectIdentities(parityRecords, "unresolved"),
    ],
  });
  const payloadJson = `${JSON.stringify(artifact, null, 2)}\n`;
  const sha256 = createHash("sha256").update(payloadJson).digest("hex");
  const json = `${JSON.stringify(
    normalizeJson({ ...artifact, normalizedArtifactSha256: sha256 }),
    null,
    2,
  )}\n`;

  return { artifact, json, sha256 };
}

export function propertyCashShadowStrictIssues(input: {
  canonicalEvents: PropertyCashEvent[];
  parityRecords: PropertyCashParityRecord[];
}) {
  return [
    ...input.canonicalEvents
      .filter((event) => event.requiresResolution)
      .toSorted((first, second) => first.eventKey.localeCompare(second.eventKey))
      .map((event) => `canonical event ${event.eventKey} requires resolution`),
    ...input.parityRecords
      .filter(
        (record) =>
          record.status === "mismatch" || record.status === "unresolved",
      )
      .toSorted(compareParityRecords)
      .map((record) => `parity metric ${record.metric} is ${record.status}`),
  ];
}

function collectIdentities(
  records: PropertyCashParityRecord[],
  key: "excluded" | "included" | "unresolved",
) {
  const byIdentity = new Map<string, PropertyCashParityIdentity>();
  for (const record of records) {
    for (const identity of record[key]) {
      byIdentity.set(JSON.stringify(normalizeJson(identity)), identity);
    }
  }
  return [...byIdentity.values()].toSorted((first, second) =>
    JSON.stringify(normalizeJson(first)).localeCompare(
      JSON.stringify(normalizeJson(second)),
    ),
  );
}

function sourceIdentity(event: PropertyCashEvent) {
  return {
    eventKey: event.eventKey,
    sourceId: event.sourceId,
    sourceType: event.sourceType,
  };
}

function compareParityRecords(
  first: PropertyCashParityRecord,
  second: PropertyCashParityRecord,
) {
  return (
    first.surface.localeCompare(second.surface) ||
    first.metric.localeCompare(second.metric) ||
    first.basis.localeCompare(second.basis)
  );
}

function countBy(values: string[]) {
  const counts: Record<string, number> = {};
  for (const value of values.toSorted()) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function cents(value: bigint | null) {
  return value === null ? null : formatExactCents(value);
}

async function* toAsync(events: PropertyCashEvent[]) {
  yield* events;
}

type JsonNormalized<T> = T extends bigint
  ? string
  : T extends readonly (infer U)[]
    ? JsonNormalized<U>[]
    : T extends object
      ? { [K in keyof T]: JsonNormalized<T[K]> }
      : T;

function normalizeJson<T>(value: T): JsonNormalized<T> {
  if (typeof value === "bigint") {
    return cents(value) as JsonNormalized<T>;
  }
  if (Array.isArray(value)) {
    return value.map(normalizeJson) as JsonNormalized<T>;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .toSorted(([first], [second]) => first.localeCompare(second))
        .map(([key, child]) => [key, normalizeJson(child)]),
    ) as JsonNormalized<T>;
  }
  return value as JsonNormalized<T>;
}
