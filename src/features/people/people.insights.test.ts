import { describe, expect, it } from "vitest";
import {
  buildPeopleTrustedReport,
  getPeopleInsights,
} from "@/features/people/people.insights";
import type { PeopleSummary, PersonRoleValue } from "@/features/people/people.types";

describe("people insights", () => {
  it("summarizes role readiness and attention queues", () => {
    const people = [
      person({
        contact: true,
        documents: 1,
        leaseCount: 1,
        roles: ["tenant"],
      }),
      person({
        contact: false,
        documents: 0,
        roles: ["owner"],
      }),
      person({
        contact: true,
        documents: 0,
        roles: [],
      }),
    ];

    const insights = getPeopleInsights(people, 3);

    expect(insights.metrics.map((metric) => metric.value)).toEqual([
      "3",
      "1/1",
      "0/1",
      "0",
    ]);
    expect(insights.attentionQueues.find((queue) => queue.id === "missing-contact")?.count).toBe(1);
    expect(insights.attentionQueues.find((queue) => queue.id === "missing-role")?.count).toBe(1);
    expect(insights.attentionQueues.find((queue) => queue.id === "missing-evidence")?.count).toBe(2);
  });

  it("preserves visible active scope when a report window is smaller than total", () => {
    const insights = getPeopleInsights(
      [person({ contact: true, documents: 1, roles: ["staff"] })],
      101,
    );

    expect(insights.visibleCount).toBe(1);
    expect(insights.metrics.find((metric) => metric.label === "People")?.helper).toBe(
      "1 visible active",
    );
  });

  it("builds traceable people report rows", () => {
    const report = buildPeopleTrustedReport({
      generatedAt: "2026-07-03T00:00:00.000Z",
      kind: "tenant-readiness",
      people: [
        person({
          contact: true,
          documents: 2,
          leaseCount: 1,
          roles: ["tenant"],
        }),
        person({
          contact: true,
          documents: 1,
          roles: ["vendor"],
        }),
      ],
      totalCount: 2,
    });

    expect(report.title).toBe("Tenant Readiness");
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]?.sourceLinks[0]?.recordType).toBe("person");
    expect(report.rows[0]?.cells.linked).toBe("1 active lease");
  });
});

function person({
  contact,
  documents,
  leaseCount = 0,
  ownerPropertyCount = 0,
  roles,
}: {
  contact: boolean;
  documents: number;
  leaseCount?: number;
  ownerPropertyCount?: number;
  roles: PersonRoleValue[];
}): PeopleSummary {
  const id = `person-${roles.join("-") || "none"}-${contact ? "contact" : "missing"}`;

  return {
    activity: [],
    contact: {
      email: contact ? "person@example.com" : null,
      label: contact ? "person@example.com" : "No contact",
      phone: null,
    },
    displayName: id,
    documents: [],
    formValues: {
      displayName: id,
      partyType: "individual",
      roles,
    },
    hasUsefulContact: contact,
    hrefs: {
      addLease: "/leases?action=create",
      addTimelineEvent: "/timeline?action=create",
      documents: "/documents",
      ledger: "/ledger",
      leases: "/leases",
      people: `/people/${id}`,
      timeline: "/timeline",
    },
    id,
    isArchived: false,
    linked: {
      activeLeaseCount: leaseCount,
      activeLeases: [],
      ownerProperties: [],
      ownerPropertyCount,
      vendorProfile: roles.includes("vendor")
        ? {
            id: `${id}-vendor`,
            label: "Cleaning / Phnom Penh",
            preferred: true,
            status: "active",
          }
        : undefined,
    },
    nextAction: {
      description: "Review linked work.",
      href: "/people",
      label: "Review linked work",
      tone: "neutral",
    },
    partyType: "individual",
    partyTypeLabel: "Individual",
    recordCounts: {
      activity: 0,
      documents,
      leases: leaseCount,
      properties: ownerPropertyCount,
      vendors: roles.includes("vendor") ? 1 : 0,
    },
    riskIndicators: [],
    roleLabel: roles.join(", ") || "No role",
    roles: roles.map((role) => ({ role, status: "active" })),
    statusLabel: "Active",
    statusTone: "success",
    updatedAt: "2026-07-03T00:00:00.000Z",
  };
}
