import { describe, expect, it } from "vitest";
import {
  buildPeopleTrustedReport,
  getPeopleInsights,
} from "@/features/people/people.insights";
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
          nextActionHref: `/settings/access?personId=${staff.id}`,
        });
        expect(report.rows[0]?.cells.linked).toBe("No workspace access");
      }
    },
  );

  it("keeps traceable sources and PDF generation for People Readiness", () => {
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

    const pdf = buildTrustedReportPdf({
      organizationName: "Demo Organization",
      report,
    });

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

  it("emits Workspace Access sources only for real invitations and memberships", () => {
    const noAccess = staffPerson("person-no-access", "No Access Staff");
    const pending = staffPerson("person-pending", "Pending Staff");
    const active = staffPerson("person-active", "Active Staff");
    const invitationId = "invitation-pending";
    const membershipId = "membership-active";

    const report = buildPeopleTrustedReport({
      accessByPersonId: {
        [noAccess.id]: {
          primaryAction: "grant_access",
          state: "no_access",
        },
        [pending.id]: {
          branchId: null,
          email: "pending@example.com",
          expiresAt: "2026-07-25T00:00:00.000Z",
          invitationId,
          lastSentAt: "2026-07-24T00:00:00.000Z",
          primaryAction: "review_invitation",
          role: "operations_member",
          scopeLabel: "All branches",
          state: "invitation_pending",
        },
        [active.id]: {
          branchId: null,
          email: "active@example.com",
          membershipId,
          primaryAction: "manage_access",
          role: "operations_manager",
          scopeLabel: "All branches",
          state: "active_workspace_access",
        },
      },
      generatedAt: "2026-07-24T00:00:00.000Z",
      kind: "staff-access",
      people: [noAccess, pending, active],
    });

    const noAccessRow = report.rows.find((row) => row.id === noAccess.id)!;
    const pendingRow = report.rows.find((row) => row.id === pending.id)!;
    const activeRow = report.rows.find((row) => row.id === active.id)!;

    expect(noAccessRow).toMatchObject({
      nextActionHref: `/settings/access?personId=${noAccess.id}`,
      sourceCount: 1,
      sourceSummary: "1 linked source",
    });
    expect(noAccessRow.sourceLinks).toEqual([
      expect.objectContaining({
        id: noAccess.id,
        recordType: "person",
      }),
    ]);
    expect(noAccessRow.sourceLinks.map((source) => source.id)).toEqual([
      noAccess.id,
    ]);

    expect(pendingRow.sourceLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: pending.id,
          recordType: "person",
        }),
        expect.objectContaining({
          id: invitationId,
          recordType: "workspace-access",
        }),
      ]),
    );
    expect(pendingRow.sourceCount).toBe(2);

    expect(activeRow.sourceLinks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: active.id,
          recordType: "person",
        }),
        expect.objectContaining({
          id: membershipId,
          recordType: "workspace-access",
        }),
      ]),
    );
    expect(activeRow.nextActionHref).toBe(
      `/settings/access?personId=${active.id}&memberId=${membershipId}`,
    );
    expect(activeRow.sourceCount).toBe(2);

    const pdfText = extractPdfCommandText(
      Buffer.from(
        buildTrustedReportPdf({
          organizationName: "Demo Organization",
          report,
        }),
      ).toString("latin1"),
    );
    expect(pdfText).toMatch(/No Access Staff .* 1(?: |$)/);
    expect(pdfText).toMatch(/Pending Staff .* 2(?: |$)/);
    expect(pdfText).toMatch(/Active Staff .* 2(?: |$)/);
  });

  it("opens archived Staff without access in the Person lifecycle flow", () => {
    const archived = staffPerson("person-archived", "Archived Staff");
    archived.isArchived = true;

    const report = buildPeopleTrustedReport({
      accessByPersonId: {
        [archived.id]: {
          primaryAction: "grant_access",
          state: "no_access",
        },
      },
      kind: "staff-access",
      people: [archived],
    });

    expect(report.rows[0]).toMatchObject({
      cells: {
        next: "Review archived person",
        readiness: "Archived",
      },
      nextActionHref: `/people/${archived.id}`,
    });
  });
});

function staffPerson(id: string, displayName: string) {
  const staff = person({
    contact: true,
    documents: 0,
    roles: ["staff"],
  });
  staff.displayName = displayName;
  staff.formValues.displayName = displayName;
  staff.hrefs.people = `/people/${id}`;
  staff.id = id;
  return staff;
}

function extractPdfCommandText(pdf: string) {
  return [...pdf.matchAll(/\(((?:\\.|[^)])*)\) Tj/g)]
    .map((match) =>
      match[1]
        .replaceAll("\\(", "(")
        .replaceAll("\\)", ")")
        .replaceAll("\\\\", "\\"),
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

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
