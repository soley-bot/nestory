import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/documents/[documentId]/route";
import {
  getCurrentUser,
  getWorkspaceMembershipForUser,
} from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";
import { validPdfBytes } from "@/test-utils/upload-content";

vi.mock("@/lib/auth/context", () => ({
  getCurrentUser: vi.fn(),
  getWorkspaceMembershipForUser: vi.fn(),
}));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: vi.fn() }));

describe("GET /api/documents/[documentId]", () => {
  const documentId = "44444444-4444-4444-8444-444444444444";
  const context = { params: Promise.resolve({ documentId }) };
  const maybeSingle = vi.fn();
  const download = vi.fn();
  const query = { eq: vi.fn(), maybeSingle };
  const client = {
    from: vi.fn(() => ({ select: vi.fn(() => query) })),
    storage: { from: vi.fn(() => ({ download })) },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    query.eq.mockReturnValue(query);
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "user-1" });
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);
    vi.mocked(getWorkspaceMembershipForUser).mockResolvedValue({
      organizationId: "11111111-1111-4111-8111-111111111111",
    } as never);
    const bytes = validPdfBytes();
    maybeSingle.mockResolvedValue({
      data: {
        file_name: 'lease/..\\signed:\"2026\r\nX-Evil: yes?.pdf',
        mime_type: "application/pdf",
        size_bytes: bytes.byteLength,
        storage_path: "org/branches/branch/documents/signed.pdf",
      },
      error: null,
    });
    download.mockResolvedValue({
      data: new Blob([bytes], { type: "application/pdf" }),
      error: null,
    });
  });

  it("rejects anonymous access before opening a database client", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/documents/x"), context);

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it.each(["not-a-uuid", "00000000-0000-0000-0000-000000000000"])(
    "normalizes an invalid document id %s",
    async (invalidId) => {
      const response = await GET(new Request("http://localhost/api/documents/x"), {
        params: Promise.resolve({ documentId: invalidId }),
      });

      expect(response.status).toBe(409);
      expect(await response.text()).toBe("Document unavailable.");
      expect(maybeSingle).not.toHaveBeenCalled();
    },
  );

  it("rejects a user without a current organization membership", async () => {
    vi.mocked(getWorkspaceMembershipForUser).mockResolvedValue(null);

    const response = await GET(new Request("http://localhost/api/documents/x"), context);

    expect(response.status).toBe(403);
    expect(download).not.toHaveBeenCalled();
  });

  it("returns a private attachment with a fixed verified type and sanitized filename", async () => {
    const response = await GET(new Request("http://localhost/api/documents/x"), context);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-length")).toBe(String(validPdfBytes().byteLength));
    expect(response.headers.get("content-disposition")).toBe(
      'attachment; filename="lease-..-signed--2026-X-Evil- yes-.pdf"',
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-evil")).toBeNull();
    expect(query.eq).toHaveBeenNthCalledWith(1, "id", documentId);
    expect(query.eq).toHaveBeenNthCalledWith(
      2,
      "organization_id",
      "11111111-1111-4111-8111-111111111111",
    );
    expect(download).toHaveBeenCalledWith("org/branches/branch/documents/signed.pdf");
  });

  it("fails closed when stored bytes no longer match the registered size or type", async () => {
    const stored = new Blob(["not a PDF"], { type: "application/pdf" });
    const arrayBuffer = vi.spyOn(stored, "arrayBuffer");
    download.mockResolvedValue({
      data: stored,
      error: null,
    });

    const response = await GET(new Request("http://localhost/api/documents/x"), context);

    expect(response.status).toBe(409);
    expect(await response.text()).toBe("Document unavailable.");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("normalizes database and storage failures without provider details", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: "secret table detail" } });

    const response = await GET(new Request("http://localhost/api/documents/x"), context);
    const body = await response.text();

    expect(response.status).toBe(409);
    expect(body).toBe("Document unavailable.");
    expect(body).not.toContain("secret");
  });
});
