import { downloadTenantCommercialDocumentArtifact } from "@/features/finance-operations/documents/commercial-document-artifacts";
import {
  getCurrentUser,
  getWorkspaceMembershipForUser,
} from "@/lib/auth/context";
import { getWorkspaceCapabilities } from "@/lib/auth/capabilities";
import { createSupabaseServerClient } from "@/lib/db/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };
const UNAVAILABLE = "Document unavailable.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NIL_UUID = "00000000-0000-0000-0000-000000000000";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ artifactId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return textResponse("Unauthorized", 401);

  const client = await createSupabaseServerClient();
  const membership = await getWorkspaceMembershipForUser(user.id, client);
  if (!membership || !getWorkspaceCapabilities(membership.role).canReadFinance) {
    return textResponse("Forbidden", 403);
  }

  const { artifactId } = await params;
  if (!UUID.test(artifactId) || artifactId === NIL_UUID) {
    return textResponse(UNAVAILABLE, 409);
  }

  try {
    const artifact = await downloadTenantCommercialDocumentArtifact(
      client,
      membership.organizationId,
      artifactId,
    );
    const filename = sanitizeAttachmentFilename(artifact.filename);
    const body = artifact.bytes.buffer.slice(
      artifact.bytes.byteOffset,
      artifact.bytes.byteOffset + artifact.bytes.byteLength,
    ) as ArrayBuffer;
    return new Response(body, {
      headers: {
        ...PRIVATE_HEADERS,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(artifact.bytes.byteLength),
        "Content-Type": artifact.contentType,
      },
    });
  } catch {
    return textResponse(UNAVAILABLE, 409);
  }
}

function textResponse(body: string, status: number) {
  return new Response(body, { headers: PRIVATE_HEADERS, status });
}

function sanitizeAttachmentFilename(filename: string) {
  const safe = filename.replace(/[\\/:*?"<>|\r\n]/g, "-").trim();
  return safe || "document.pdf";
}
