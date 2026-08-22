import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/finance/documents/[artifactId]/route";
import { downloadTenantCommercialDocumentArtifact } from "@/features/finance-operations/documents/commercial-document-artifacts";
import {
  getCurrentUser,
  getWorkspaceMembershipForUser,
} from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";
import type { PermissionKey } from "@/lib/auth/permission-catalog";

vi.mock("@/features/finance-operations/documents/commercial-document-artifacts", () => ({
  downloadTenantCommercialDocumentArtifact: vi.fn(),
}));
vi.mock("@/lib/auth/context", () => ({
  getCurrentUser: vi.fn(),
  getWorkspaceMembershipForUser: vi.fn(),
}));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: vi.fn() }));

describe("GET /api/finance/documents/[artifactId]", () => {
  const artifactId = "44444444-4444-4444-8444-444444444444";
  const context = { params: Promise.resolve({ artifactId }) };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-1" });
    vi.mocked(createSupabaseServerClient).mockResolvedValue({} as never);
    vi.mocked(getWorkspaceMembershipForUser).mockResolvedValue(
      membership("finance.view"),
    );
    vi.mocked(downloadTenantCommercialDocumentArtifact).mockResolvedValue({
      bytes: Uint8Array.from([0x25, 0x50, 0x44, 0x46]),
      contentType: "application/pdf",
      filename: "receipt-RCT-2026-004182.pdf",
      sourceState: "reversed",
    });
  });

  it("returns a private 401 before database access when anonymous", async () => {
    // Break caught: anonymous callers reaching financial document authority.
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/finance/documents/x"), context);
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("Unauthorized");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it.each(["not-a-uuid", "00000000-0000-0000-0000-000000000000"])
  ("returns the stable private unavailable response for invalid artifact id %s", async (invalidId) => {
    // Break caught: malformed identifiers leaking validation or provider details.
    const response = await GET(new Request("http://localhost/api/finance/documents/x"), {
      params: Promise.resolve({ artifactId: invalidId }),
    });
    expect(response.status).toBe(409);
    expect(await response.text()).toBe("Document unavailable.");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(downloadTenantCommercialDocumentArtifact).not.toHaveBeenCalled();
  });

  it("returns private 403 for a user without current organization finance access", async () => {
    // Break caught: non-finance members downloading finance documents.
    vi.mocked(getWorkspaceMembershipForUser).mockResolvedValue(membership());
    const response = await GET(new Request("http://localhost/api/finance/documents/x"), context);
    expect(response.status).toBe(403);
    expect(await response.text()).toBe("Forbidden");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(downloadTenantCommercialDocumentArtifact).not.toHaveBeenCalled();
  });

  it("returns private 403 when the signed-in user has no current organization membership", async () => {
    // Break caught: a stale session retaining access after membership removal.
    vi.mocked(getWorkspaceMembershipForUser).mockResolvedValue(null);
    const response = await GET(new Request("http://localhost/api/finance/documents/x"), context);
    expect(response.status).toBe(403);
    expect(await response.text()).toBe("Forbidden");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(downloadTenantCommercialDocumentArtifact).not.toHaveBeenCalled();
  });

  it("makes a cross-organization artifact indistinguishable from an unavailable document", async () => {
    // Break caught: artifact guessing disclosing cross-organization existence.
    vi.mocked(downloadTenantCommercialDocumentArtifact).mockRejectedValue(
      new Error("foreign organization artifact"),
    );
    const response = await GET(new Request("http://localhost/api/finance/documents/x"), context);
    expect(response.status).toBe(409);
    expect(await response.text()).toBe("Document unavailable.");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it.each([
    "missing", "failed", "voided", "reversed", "hash mismatch", "size mismatch", "provider secret tenant-commercial-documents/path.pdf",
  ])("normalizes %s downloader failures without source details", async (detail) => {
    // Break caught: route exposing storage, provider, integrity, or foreign-artifact details.
    vi.mocked(downloadTenantCommercialDocumentArtifact).mockRejectedValue(new Error(detail));
    const response = await GET(new Request("http://localhost/api/finance/documents/x"), context);
    expect(response.status).toBe(409);
    const body = await response.text();
    expect(body).toBe("Document unavailable.");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body).not.toContain("tenant-commercial-documents");
  });

  it.each(["voided", "reversed"])("uses organization-scoped verified bytes for an immutable %s-source receipt attachment", async (sourceState) => {
    // Break caught: bypassing Task 3 verification or omitting safe attachment headers.
    vi.mocked(downloadTenantCommercialDocumentArtifact).mockResolvedValue({
      bytes: Uint8Array.from([0x25, 0x50, 0x44, 0x46]),
      contentType: "application/pdf",
      filename: "receipt-RCT-2026-004182.pdf",
      sourceState,
    });
    const response = await GET(new Request("http://localhost/api/finance/documents/x"), context);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-length")).toBe("4");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="receipt-RCT-2026-004182.pdf"');
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.arrayBuffer()).toEqual(Uint8Array.from([0x25, 0x50, 0x44, 0x46]).buffer);
    expect(downloadTenantCommercialDocumentArtifact).toHaveBeenCalledWith(
      expect.anything(),
      "11111111-1111-4111-8111-111111111111",
      artifactId,
    );
  });

  it("sanitizes every header-dangerous filename character before quoting Content-Disposition", async () => {
    // Break caught: private artifact filename characters injecting or splitting response headers.
    vi.mocked(downloadTenantCommercialDocumentArtifact).mockResolvedValue({
      bytes: Uint8Array.from([0x25, 0x50, 0x44, 0x46]),
      contentType: "application/pdf",
      filename: 'receipt/..\\RCT:\"2026\r\nX-Evil: yes?.pdf',
      sourceState: "current",
    });

    const response = await GET(new Request("http://localhost/api/finance/documents/x"), context);

    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="receipt-..-RCT--2026--X-Evil- yes-.pdf"',
    );
    expect(response.headers.get("content-disposition")).not.toContain("\r");
    expect(response.headers.get("content-disposition")).not.toContain("\n");
    expect(response.headers.get("x-evil")).toBeNull();
  });
});

function membership(...permissionKeys: PermissionKey[]) {
  return {
    branchId: "branch-1",
    isSuperAdmin: false,
    organizationId: "11111111-1111-4111-8111-111111111111",
    organizationName: "Nestory",
    permissionKeys: new Set(permissionKeys),
    personId: "person-1",
    role: "custom",
    roleKind: "custom",
    roleName: "Finance Viewer",
    theme: { accentPreset: "neutral", accentSeed: null, mode: "system" },
  } as never;
}
