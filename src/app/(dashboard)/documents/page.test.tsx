import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDocumentsScreenData: vi.fn(),
  requirePermission: vi.fn(),
}));

vi.mock("@/features/documents/data/documents", () => ({
  getDocumentsScreenData: mocks.getDocumentsScreenData,
}));
vi.mock("@/lib/auth/context", () => ({
  requirePermission: mocks.requirePermission,
}));
vi.mock("@/features/documents/components/document-screen", () => ({
  DocumentScreen: vi.fn((props: unknown) => props),
}));

import DocumentsPage from "@/app/(dashboard)/documents/page";

describe("DocumentsPage authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({
      organizationId: "org-1",
      permissionKeys: new Set(["properties.view", "properties.write"]),
    });
    mocks.getDocumentsScreenData.mockResolvedValue({
      documents: [],
      pagination: {},
      propertyOptions: [],
      unitOptions: [],
    });
  });

  it("reads through properties.view and derives lifecycle controls from exact keys", async () => {
    const result = await DocumentsPage({ searchParams: Promise.resolve({}) });

    expect(mocks.requirePermission).toHaveBeenCalledWith("properties.view");
    expect(result.props.permissionKeys).toEqual([
      "properties.view",
      "properties.write",
    ]);
  });
});
