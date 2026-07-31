import { describe, expect, it } from "vitest";
import {
  buildNewLeaseRelationshipPayload,
  buildPlannedLeaseRelationshipPayload,
} from "@/features/leases/lease-relationship-input";

const tenantPersonId = "11111111-1111-4111-8111-111111111111";

describe("new Lease relationship payload", () => {
  it("keeps omitted party and occupancy boundaries unknown without copying term dates", () => {
    expect(
      buildNewLeaseRelationshipPayload({
        leaseStatus: "active",
        recordSource: "operator_confirmed",
        tenantPersonId,
      }),
    ).toEqual({
      occupancy: {
        actualMoveIn: {
          confidence: "unknown",
          date: null,
          kind: "unknown",
        },
        actualMoveOut: {
          confidence: "unknown",
          date: null,
          kind: "unknown",
        },
        lifecycle: "occupied",
        reason: "new_lease_relationship_composition",
        recordSource: "operator_confirmed",
        scheduledMoveIn: {
          confidence: "unknown",
          date: null,
          kind: "unknown",
        },
        scheduledMoveOut: {
          confidence: "unknown",
          date: null,
          kind: "unknown",
        },
      },
      participants: [],
      primaryParty: {
        endedOn: {
          confidence: "unknown",
          date: null,
          kind: "unknown",
        },
        lifecycle: "effective",
        personId: tenantPersonId,
        reason: "new_lease_relationship_composition",
        recordSource: "operator_confirmed",
        startedOn: {
          confidence: "unknown",
          date: null,
          kind: "unknown",
        },
      },
    });
  });

  it("preserves explicit planned facts while leaving actual dates unknown", () => {
    expect(
      buildPlannedLeaseRelationshipPayload({
        leaseStatus: "draft",
        participantEndDate: "2027-05-31",
        participantStartDate: "2027-05-02",
        partyEndDate: "2027-05-31",
        partyStartDate: "2027-05-01",
        recordSource: "imported_explicit",
        scheduledMoveInDate: "2027-05-02",
        scheduledMoveOutDate: "2027-05-31",
        tenantPersonId,
      }),
    ).toEqual({
      occupancy: {
        actualMoveIn: {
          confidence: "unknown",
          date: null,
          kind: "unknown",
        },
        actualMoveOut: {
          confidence: "unknown",
          date: null,
          kind: "unknown",
        },
        lifecycle: "reserved",
        reason: "new_lease_relationship_composition",
        recordSource: "imported_explicit",
        scheduledMoveIn: {
          confidence: "confirmed",
          date: "2027-05-02",
          kind: "known",
        },
        scheduledMoveOut: {
          confidence: "confirmed",
          date: "2027-05-31",
          kind: "known",
        },
      },
      participants: [
        {
          endedOn: {
            confidence: "confirmed",
            date: "2027-05-31",
            kind: "known",
          },
          lifecycle: "planned",
          personId: tenantPersonId,
          reason: "new_lease_relationship_composition",
          recordSource: "imported_explicit",
          startedOn: {
            confidence: "confirmed",
            date: "2027-05-02",
            kind: "known",
          },
        },
      ],
      primaryParty: {
        endedOn: {
          confidence: "confirmed",
          date: "2027-05-31",
          kind: "known",
        },
        lifecycle: "planned",
        personId: tenantPersonId,
        reason: "new_lease_relationship_composition",
        recordSource: "imported_explicit",
        startedOn: {
          confidence: "confirmed",
          date: "2027-05-01",
          kind: "known",
        },
      },
    });
  });

  it("keeps cancelled-before-effective facts out of responsibility and occupancy", () => {
    expect(
      buildNewLeaseRelationshipPayload({
        leaseStatus: "cancelled",
        recordSource: "operator_confirmed",
        tenantPersonId,
      }),
    ).toMatchObject({
      occupancy: {
        actualMoveIn: { date: null, kind: "unknown" },
        actualMoveOut: { date: null, kind: "unknown" },
        lifecycle: "cancelled_before_effective",
      },
      participants: [],
      primaryParty: {
        lifecycle: "cancelled_before_effective",
      },
    });
  });

  it.each([
    ["draft", "planned"],
    ["active", "present"],
    ["notice_given", "present"],
    ["ended", "ended"],
    ["terminated", "ended"],
    ["cancelled", "cancelled_before_effective"],
  ] as const)(
    "maps explicit %s participant evidence to %s",
    (leaseStatus, participantLifecycle) => {
      expect(
        buildPlannedLeaseRelationshipPayload({
          leaseStatus,
          participantEndDate: "2027-05-31",
          participantStartDate: "2027-05-02",
          recordSource: "operator_confirmed",
          tenantPersonId,
        }),
      ).toMatchObject({
        participants: [
          {
            endedOn: {
              confidence: "confirmed",
              date: "2027-05-31",
              kind: "known",
            },
            lifecycle: participantLifecycle,
            startedOn: {
              confidence: "confirmed",
              date: "2027-05-02",
              kind: "known",
            },
          },
        ],
      });
    },
  );
});
