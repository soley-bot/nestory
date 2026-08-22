import { describe, expect, it } from "vitest";
import {
  getDocumentAuthorityDomain,
  getDocumentPermission,
} from "@/features/documents/document-authority";

describe("document parent-domain authority", () => {
  it("uses finance, maintenance, lease, then property priority", () => {
    expect(getDocumentAuthorityDomain({ ledgerEntryId: "ledger", taskId: "task" })).toBe("finance");
    expect(getDocumentAuthorityDomain({ leaseId: "lease", taskId: "task" })).toBe("maintenance");
    expect(getDocumentAuthorityDomain({ leaseId: "lease" })).toBe("lease");
    expect(getDocumentAuthorityDomain({ propertyId: "property" })).toBe("property");
  });

  it("maps timeline sources and operations to exact database keys", () => {
    expect(
      getDocumentAuthorityDomain({
        propertyId: "property",
        timelineEvent: { eventType: "Rent Increase", leaseId: "lease" },
      }),
    ).toBe("lease");
    expect(getDocumentPermission("finance", "write")).toBe("finance.correct_records");
    expect(getDocumentPermission("maintenance", "archive")).toBe("maintenance.create_assign");
    expect(getDocumentPermission("lease", "archive")).toBe("leases.archive");
    expect(getDocumentPermission("property", "read")).toBe("properties.view");
  });
});
