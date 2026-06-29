import { describe, expect, it } from "vitest";
import {
  DEFAULT_DOCUMENT_PAGE_SIZE,
  buildDocumentPagination,
  parseDocumentSearchParams,
} from "@/features/documents/document.filters";

describe("parseDocumentSearchParams", () => {
  it("normalizes default document filters", () => {
    expect(parseDocumentSearchParams({})).toEqual({
      archiveState: "active",
      documentId: "all",
      leaseId: "all",
      page: 1,
      pageSize: DEFAULT_DOCUMENT_PAGE_SIZE,
      propertyId: "all",
      query: "",
      taskId: "all",
      unitId: "all",
    });
  });

  it("keeps supported property and unit route context", () => {
    expect(
      parseDocumentSearchParams({
        archiveState: "all",
        documentId: "55555555-5555-4555-8555-555555555555",
        leaseId: "44444444-4444-4444-8444-444444444444",
        page: "2",
        pageSize: "100",
        propertyId: "11111111-1111-4111-8111-111111111111",
        query: "  lease agreement  ",
        taskId: "33333333-3333-4333-8333-333333333333",
        unitId: "22222222-2222-4222-8222-222222222222",
      }),
    ).toEqual({
      archiveState: "all",
      documentId: "55555555-5555-4555-8555-555555555555",
      leaseId: "44444444-4444-4444-8444-444444444444",
      page: 2,
      pageSize: 100,
      propertyId: "11111111-1111-4111-8111-111111111111",
      query: "lease agreement",
      taskId: "33333333-3333-4333-8333-333333333333",
      unitId: "22222222-2222-4222-8222-222222222222",
    });
  });

  it("falls back for invalid scoped params", () => {
    expect(
      parseDocumentSearchParams({
        archiveState: "deleted",
        documentId: "not-a-uuid",
        page: "-1",
        pageSize: "500",
        leaseId: "not-a-uuid",
        propertyId: "not-a-uuid",
        unitId: "not-a-uuid",
      }),
    ).toMatchObject({
      archiveState: "active",
      documentId: "all",
      leaseId: "all",
      page: 1,
      pageSize: DEFAULT_DOCUMENT_PAGE_SIZE,
      propertyId: "all",
      taskId: "all",
      unitId: "all",
    });
  });
});

describe("buildDocumentPagination", () => {
  it("clamps empty and over-large pages", () => {
    expect(
      buildDocumentPagination({ page: 4, pageSize: 25, totalCount: 0 }),
    ).toEqual({
      from: 0,
      page: 1,
      pageSize: 25,
      to: 0,
      totalCount: 0,
      totalPages: 1,
    });
  });
});
