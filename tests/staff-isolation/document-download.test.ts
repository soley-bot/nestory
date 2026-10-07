import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/documents/[documentId]/route";
import { getCurrentUser, getWorkspaceMembershipForUser } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";
import { validateUploadedFileContent } from "@/lib/uploads/upload-content";
import { validPdfBytes, validPngBytes, validJpegBytes, validWebpBytes } from "@/test-utils/upload-content";
import { scopes } from "./fixtures";

vi.mock("@/lib/auth/context", () => ({ getCurrentUser: vi.fn(), getWorkspaceMembershipForUser: vi.fn() }));
vi.mock("@/lib/db/server", () => ({ createSupabaseServerClient: vi.fn() }));

const maybeSingle = vi.fn();
const download = vi.fn();
const query = { eq: vi.fn(), maybeSingle };
const storage = { from: vi.fn(() => ({ download })) };
const client = { from: vi.fn(() => ({ select: vi.fn(() => query) })), storage };
const bytes = validPdfBytes();
const hash = createHash("sha256").update(bytes).digest("hex");
function request(documentId: string) {
  return GET(new Request("http://localhost/api/documents/" + documentId + "?organizationId=forged-company&branchId=forged-branch"), { params: Promise.resolve({ documentId }) });
}

describe.each(scopes)("document download $company/$branch", scope => {
  beforeEach(() => {
    vi.resetAllMocks();
    query.eq.mockReturnValue(query);
    client.from.mockReturnValue({ select: vi.fn(() => query) });
    storage.from.mockReturnValue({ download });
    vi.mocked(getCurrentUser).mockResolvedValue({ id: scope.userId });
    vi.mocked(getWorkspaceMembershipForUser).mockResolvedValue({ organizationId: scope.organizationId, branchId: scope.branch, isSuperAdmin: false } as never);
    vi.mocked(createSupabaseServerClient).mockResolvedValue(client as never);
    maybeSingle.mockResolvedValue({ data: { file_name: "scoped.pdf", mime_type: "application/pdf", size_bytes: bytes.byteLength, content_sha256: hash, storage_path: scope.storagePath }, error: null });
    download.mockResolvedValue({ data: new Blob([bytes], { type: "application/pdf" }), error: null });
  });
  it("returns exact authorized bytes bound to membership company", async () => {
    const response = await request(scope.artifactId);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(query.eq).toHaveBeenCalledWith("organization_id", scope.organizationId);
    expect(download).toHaveBeenCalledExactlyOnceWith(scope.storagePath);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it.each(["sibling", "foreign"])("does not fetch bytes after a known %s ID is hidden", async kind => {
    const target = scopes.find(x => kind === "sibling" ? x.organizationId === scope.organizationId && x.branch !== scope.branch : x.organizationId !== scope.organizationId)!;
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const response = await request(target.artifactId);
    expect(response.status).toBe(409);
    expect(await response.text()).toBe("Document unavailable.");
    expect(query.eq).toHaveBeenCalledWith("id", target.artifactId);
    expect(query.eq).toHaveBeenCalledWith("organization_id", scope.organizationId);
    expect(storage.from).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
  });
  it("denies a second request for the same user after membership revocation", async () => {
    expect((await request(scope.artifactId)).status).toBe(200);
    vi.mocked(getWorkspaceMembershipForUser).mockResolvedValue(null);
    const revoked = await request(scope.artifactId);
    expect(revoked.status).toBe(403);
    expect(download).toHaveBeenCalledTimes(1);
    expect(maybeSingle).toHaveBeenCalledTimes(1);
    expect(getCurrentUser).toHaveBeenCalledTimes(2);
  });
  it("rejects changed same-size bytes even when they remain a valid PDF", async () => {
    const changed = new Uint8Array(bytes);
    changed[7] = "6".charCodeAt(0);
    expect(changed.byteLength).toBe(bytes.byteLength);
    expect(await validateUploadedFileContent(new File([changed], "scoped.pdf", { type: "application/pdf" }), ["application/pdf"])).toMatchObject({ ok: true });
    download.mockResolvedValue({ data: new Blob([changed], { type: "application/pdf" }), error: null });
    const response = await request(scope.artifactId);
    expect(response.status).toBe(409);
    expect(await response.text()).toBe("Document unavailable.");
  });
  it("hides provider errors without returning any document bytes", async () => {
    download.mockResolvedValue({ data: null, error: { message: "private provider path" } });
    const response = await request(scope.artifactId);
    expect(response.status).toBe(409);
    expect(await response.text()).toBe("Document unavailable.");
  });
  it.each([
    ["image/png", "scoped.png", validPngBytes],
    ["image/jpeg", "scoped.jpg", validJpegBytes],
    ["image/webp", "scoped.webp", validWebpBytes],
  ] as const)("preserves matching retained %s bytes", async (type, name, makeBytes) => {
    const image = makeBytes();
    maybeSingle.mockResolvedValue({ data: { file_name: name, mime_type: type, size_bytes: image.byteLength, content_sha256: createHash("sha256").update(image).digest("hex"), storage_path: scope.storagePath }, error: null });
    download.mockResolvedValue({ data: new Blob([image], { type }), error: null });
    const response = await request(scope.artifactId);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(type);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(image);
  });
  it.each([
    ["image/png", "scoped.png", validPngBytes],
    ["image/jpeg", "scoped.jpg", validJpegBytes],
    ["image/webp", "scoped.webp", validWebpBytes],
  ] as const)("rejects mismatched retained %s bytes", async (type, name, makeBytes) => {
    const image = makeBytes();
    expect(await validateUploadedFileContent(new File([image], name, { type }), [type])).toMatchObject({ ok: true });
    maybeSingle.mockResolvedValue({ data: { file_name: name, mime_type: type, size_bytes: image.byteLength, content_sha256: "0".repeat(64), storage_path: scope.storagePath }, error: null });
    download.mockResolvedValue({ data: new Blob([image], { type }), error: null });
    const response = await request(scope.artifactId);
    expect(response.status).toBe(409);
    expect(await response.text()).toBe("Document unavailable.");
  });

  it.each(["valid", "unverified"])("rejects %s bytes when selected fingerprint metadata is missing", async kind => {
    const body = kind === "valid" ? validPdfBytes() : new TextEncoder().encode("legacy bytes");
    maybeSingle.mockResolvedValue({ data: { file_name: "scoped.pdf", mime_type: "application/pdf", size_bytes: body.byteLength, storage_path: scope.storagePath }, error: null });
    download.mockResolvedValue({ data: new Blob([body], { type: "application/pdf" }), error: null });
    const response = await request(scope.artifactId);
    expect(response.status).toBe(409);
    expect(await response.text()).toBe("Document unavailable.");
  });

});
