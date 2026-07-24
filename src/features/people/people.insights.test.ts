import { describe, expect, it } from "vitest";
import {
  buildPeopleTrustedReport,
  getPeopleInsights,
} from "@/features/people/people.insights";
import { buildTrustedReportCsv } from "@/features/reports/data/csv";
import { buildTrustedReportPdf } from "@/features/reports/data/pdf";
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

  it("calculates readiness metrics over archived rows when the report scope selects them", () => {
    const archived = person({ contact: false, documents: 0, roles: ["owner"] });
    archived.isArchived = true;

    const report = buildPeopleTrustedReport({
      kind: "relationship-readiness",
      people: [archived],
    });

    expect(report.rows[0]?.cells.readiness).toBe("Archived");
    expect(
      report.summary.find((metric) => metric.label === "Missing contact")?.value,
    ).toBe("1");
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

  it.each([
    ["relationship-readiness", 5, "Relationship Readiness"],
    ["tenant-readiness", 1, "Tenant Readiness"],
    ["owner-readiness", 1, "Owner Readiness"],
    ["vendor-activity", 1, "Vendor Activity"],
    ["staff-access", 1, "Staff Access"],
  ] as const)(
    "preserves the %s report variant in the central trusted-report shape",
    (kind, expectedRows, title) => {
      const people = [
        person({
          contact: true,
          documents: 1,
          leaseCount: 1,
          roles: ["tenant"],
        }),
        person({
          contact: true,
          documents: 1,
          ownerPropertyCount: 1,
          roles: ["owner"],
        }),
        person({
          contact: true,
          documents: 1,
          roles: ["vendor"],
        }),
        person({
          contact: true,
          documents: 1,
          roles: ["staff"],
        }),
        person({
          contact: false,
          documents: 0,
          roles: [],
        }),
      ];
      const staff = people.find((candidate) =>
        candidate.roles.some((role) => role.role === "staff"),
      )!;

      const report = buildPeopleTrustedReport({
        accessByPersonId: {
          [staff.id]: {
            primaryAction: "grant_access",
            state: "no_access",
          },
        },
        generatedAt: "2026-07-24T00:00:00.000Z",
        kind,
        people,
        totalCount: people.length,
      });

      expect(report.kind).toBe("people-readiness");
      expect(report.title).toBe(title);
      expect(report.rows).toHaveLength(expectedRows);
      expect(report.columns.map((column) => column.label)).toEqual([
        "Readiness",
        "Roles",
        "Contact",
        "Linked context",
        "Evidence",
        "Next action",
      ]);
      expect(report.rows.every((row) => row.href === `/people/${row.id}`)).toBe(
        true,
      );

      if (kind === "staff-access") {
        expect(report.rows[0]).toMatchObject({
          nextActionHref: `/users-roles?personId=${staff.id}`,
        });
        expect(report.rows[0]?.cells.linked).toBe("No workspace access");
      }
    },
  );

  it("keeps central CSV headers, rows, sources, and PDF generation for People Readiness", () => {
    const tenant = person({
      contact: true,
      documents: 2,
      leaseCount: 1,
      roles: ["tenant", "owner"],
    });
    tenant.linked.activeLeases = [
      {
        endDate: "2027-06-30",
        href: "/leases?leaseId=lease-1",
        id: "lease-1",
        label: "Lease One",
        ledgerHref: "/ledger?leaseId=lease-1",
        propertyId: "property-1",
        propertyLabel: "Property One",
        startDate: "2026-07-01",
        status: "active",
        timelineHref: "/timeline?leaseId=lease-1",
        unitId: "unit-1",
        unitLabel: "Unit One",
      },
    ];

    const report = buildPeopleTrustedReport({
      generatedAt: "2026-07-24T00:00:00.000Z",
      kind: "tenant-readiness",
      people: [tenant],
    });

    const csv = buildTrustedReportCsv(report);
    const pdf = buildTrustedReportPdf({
      organizationName: "Demo Organization",
      report,
    });

    expect(csv).toContain(
      "Row,Title,Readiness,Roles,Contact,Linked context,Evidence,Next action,Source records,Source ids,Source links",
    );
    expect(csv).toContain(report.rows[0]!.id);
    expect(csv).toContain(`/people/${report.rows[0]!.id}`);
    expect(csv).toContain("lease-1");
    expect(report.rows[0]?.sourceLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          href: "/leases?leaseId=lease-1",
          id: "lease-1",
          recordType: "lease",
        }),
      ]),
    );
    expect(pdf.byteLength).toBeGreaterThan(500);
    expect(new TextDecoder().decode(pdf.slice(0, 8))).toBe("%PDF-1.4");
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
