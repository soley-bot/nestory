import {
  getCurrentUser,
  getWorkspaceMembershipForUser,
} from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";
import {
  sanitizeAttachmentFilename,
} from "@/lib/uploads/document-download";
import {
  type UploadContentType,
  MAX_UPLOAD_BYTES,
  validateUploadedFileContent,
} from "@/lib/uploads/upload-content";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};
const UNAVAILABLE = "Document unavailable.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NIL_UUID = "00000000-0000-0000-0000-000000000000";
const DOCUMENT_TYPES = new Set<UploadContentType>([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return textResponse("Unauthorized", 401);

  const client = await createSupabaseServerClient();
  const membership = await getWorkspaceMembershipForUser(user.id, client);
  if (!membership) return textResponse("Forbidden", 403);

  const { documentId } = await params;
  if (!UUID.test(documentId) || documentId === NIL_UUID) {
    return textResponse(UNAVAILABLE, 409);
  }

  try {
    const result = await client
      .from("documents")
      .select("file_name, mime_type, size_bytes, storage_path")
      .eq("id", documentId)
      .eq("organization_id", membership.organizationId)
      .maybeSingle();
    const document = result.data;
    if (result.error || !document || !isDocumentType(document.mime_type)) {
      return textResponse(UNAVAILABLE, 409);
    }
    if (
      !Number.isSafeInteger(document.size_bytes)
      || document.size_bytes <= 0
      || document.size_bytes > MAX_UPLOAD_BYTES
    ) {
      return textResponse(UNAVAILABLE, 409);
    }

    const stored = await client.storage
      .from("nestory-documents")
      .download(document.storage_path);
    if (
      stored.error
      || !stored.data
      || stored.data.size !== document.size_bytes
    ) {
      return textResponse(UNAVAILABLE, 409);
    }

    const bytes = new Uint8Array(await stored.data.arrayBuffer());
    if (bytes.byteLength !== document.size_bytes) {
      return textResponse(UNAVAILABLE, 409);
    }
    const verified = await validateUploadedFileContent(
      new File([bytes], document.file_name, { type: document.mime_type }),
      [document.mime_type],
    );
    if (!verified.ok) return textResponse(UNAVAILABLE, 409);

    const filename = sanitizeAttachmentFilename(document.file_name);
    const body = verified.bytes.buffer.slice(
      verified.bytes.byteOffset,
      verified.bytes.byteOffset + verified.bytes.byteLength,
    ) as ArrayBuffer;
    return new Response(body, {
      headers: {
        ...PRIVATE_HEADERS,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(verified.bytes.byteLength),
        "Content-Type": verified.contentType,
      },
    });
  } catch {
    return textResponse(UNAVAILABLE, 409);
  }
}

function isDocumentType(value: string): value is UploadContentType {
  return DOCUMENT_TYPES.has(value as UploadContentType);
}

function textResponse(body: string, status: number) {
  return new Response(body, {
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Type": "text/plain; charset=utf-8",
    },
    status,
  });
}
