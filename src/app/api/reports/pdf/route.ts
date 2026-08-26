import { getReportPdf } from "@/features/reports/data/pdf";
import { downloadOwnerStatementArtifact } from "@/features/reports/data/owner-statement-artifacts";
import { parseReportSearchParams } from "@/features/reports/reports.filters";
import {
  getCurrentUser,
  getFinanceReportMembershipForUser,
  getOwnerStatementMembershipForUser,
} from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return textResponse("Unauthorized", 401);
  }

  const url = new URL(request.url);
  const artifactId = url.searchParams.get("artifactId");
  if (artifactId) {
    const membership = await getOwnerStatementMembershipForUser(user.id);
    if (!membership) {
      return textResponse("Forbidden", 403);
    }
    try {
      const supabase = await createSupabaseServerClient();
      const artifact = await downloadOwnerStatementArtifact(
        supabase,
        membership.organizationId,
        artifactId,
      );
      if (artifact.format !== "pdf") {
        return textResponse("Owner Statement artifact format mismatch.", 409);
      }
      return attachment(artifact.bytes, artifact.filename, artifact.contentType);
    } catch {
      return textResponse("Official Owner Statement artifact is unavailable.", 409);
    }
  }

  const membership = await getFinanceReportMembershipForUser(user.id);
  if (!membership) {
    return textResponse("Forbidden", 403);
  }

  const searchParams = Object.fromEntries(url.searchParams);
  const viewQuery = parseReportSearchParams(searchParams);
  const pdf = await getReportPdf(
    membership.organizationId,
    membership.organizationName,
    viewQuery,
  );
  if ("validation" in pdf) {
    return textResponse(pdf.validation.message, pdf.validation.status);
  }
  return attachment(pdf.body, pdf.filename, "application/pdf");
}

function attachment(bodyBytes: Uint8Array, filename: string, contentType: string) {
  const body = bodyBytes.buffer.slice(
    bodyBytes.byteOffset,
    bodyBytes.byteOffset + bodyBytes.byteLength,
  ) as ArrayBuffer;
  return new Response(body, {
    headers: {
      ...PRIVATE_HEADERS,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(bodyBytes.byteLength),
      "Content-Type": contentType,
    },
  });
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
