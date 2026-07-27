import { describe, expect, it } from "vitest";
import {
  buildPropertyCashShadowArtifact,
  propertyCashShadowStrictIssues,
} from "@/features/finance/data/property-cash-shadow-artifact";
import type { PropertyCashEvent } from "@/features/finance/data/property-cash-events.types";
import type { PropertyCashParityRecord } from "@/features/finance/data/property-cash-shadow-parity";

const scope = {
  currency: "USD" as const,
  organizationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  periodEnd: "2026-07-31",
  periodStart: "2026-07-01",
  propertyId: "11111111-1111-4111-8111-111111111111",
};

describe("property cash shadow artifact", () => {
  it("normalizes unordered evidence to one deterministic hash", async () => {
    const first = await buildPropertyCashShadowArtifact({
      canonicalEvents: [residual("b"), residual("a")],
      contractVersion: "property_cash_events_v1",
      migrationIdentity: "20260727081219_property_cash_events_v1.sql",
      parityRecords: [parity("z", "not_comparable"), parity("a", "match")],
      repositoryDirty: false,
      repositorySha: "abc123",
      schemaIdentity: "schema-1",
      scope,
      sourceWatermark: { key: "stable" },
    });
    const second = await buildPropertyCashShadowArtifact({
      canonicalEvents: [residual("a"), residual("b")],
      contractVersion: "property_cash_events_v1",
      migrationIdentity: "20260727081219_property_cash_events_v1.sql",
      parityRecords: [parity("a", "match"), parity("z", "not_comparable")],
      repositoryDirty: false,
      repositorySha: "abc123",
      schemaIdentity: "schema-1",
      scope,
      sourceWatermark: { key: "stable" },
    });

    expect(first.sha256).toBe(second.sha256);
    expect(first.json).toBe(second.json);
    expect(JSON.parse(first.json).normalizedArtifactSha256).toBe(first.sha256);
    expect(first.artifact.residualHeaderEvents).toHaveLength(2);
    expect(first.artifact.resolutionCodeCounts).toEqual({
      missing_reconciliation_source: 2,
      receipt_header_unapplied: 2,
    });
  });

  it("strict mode ignores not-comparable records but rejects unresolved evidence and mismatches", () => {
    expect(
      propertyCashShadowStrictIssues({
        canonicalEvents: [],
        parityRecords: [parity("informational", "not_comparable")],
      }),
    ).toEqual([]);
    expect(
      propertyCashShadowStrictIssues({
        canonicalEvents: [residual("unresolved")],
        parityRecords: [parity("broken", "mismatch")],
      }),
    ).toEqual([
      "canonical event receipt_header_residual:unresolved requires resolution",
      "parity metric broken is mismatch",
    ]);
  });
});

function residual(id: string): PropertyCashEvent {
  return {
    amountCents: BigInt(100),
    archivedAt: null,
    categoryCode: "unapplied_receipt",
    classificationStatus: "unresolved_evidence",
    contractVersion: "property_cash_events_v1",
    createdAt: "2026-07-01T00:00:00Z",
    createdBy: null,
    currency: "USD",
    depositLiabilityEffectCents: null,
    economicClass: "legacy_unclassified",
    eventDate: "2026-07-15",
    eventKey: `receipt_header_residual:${id}`,
    isLegacy: true,
    isReversal: false,
    journalEntryId: null,
    leaseId: null,
    ledgerEntryId: null,
    managementFeeEffectCents: null,
    obligationId: null,
    obligationType: null,
    operatingCashEffectCents: null,
    organizationId: scope.organizationId,
    ownerCashEffectCents: null,
    ownerPersonId: null,
    periodStart: "2026-07-01",
    projectionStatus: null,
    propertyId: scope.propertyId,
    reconciliationSourceId: null,
    reconciliationState: "missing_stable_identity",
    requiresResolution: true,
    resolutionCodes: [
      "missing_reconciliation_source",
      "receipt_header_unapplied",
    ],
    reversalSourceId: null,
    reversalSourceType: null,
    sourceId: id,
    sourceParentId: null,
    sourceParentType: null,
    sourceType: "receipt_header_residual",
    statementSection: "unresolved",
    taskId: null,
    tenantPersonId: null,
    unitId: null,
    updatedAt: null,
    updatedBy: null,
    vendorPersonId: null,
  };
}

function parity(
  metric: string,
  status: PropertyCashParityRecord["status"],
): PropertyCashParityRecord {
  return {
    basis: "period_flow",
    canonicalCents: BigInt(0),
    currency: "USD",
    currentCents: BigInt(0),
    deltaCents: BigInt(0),
    excluded: [],
    explanation: metric,
    included: [],
    metric,
    organizationId: scope.organizationId,
    periodEnd: scope.periodEnd,
    periodStart: scope.periodStart,
    propertyId: scope.propertyId,
    referenceCents: null,
    referenceDeltaCents: null,
    status,
    surface: "test",
    unresolved: [],
  };
}
