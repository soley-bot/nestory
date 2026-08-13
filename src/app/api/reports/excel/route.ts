import { getReportExcel } from "@/features/reports/data/excel";
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

export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const artifactId = url.searchParams.get("artifactId");
  if (artifactId) {
    const membership = await getOwnerStatementMembershipForUser(user.id);
    if (!membership) {
      return new Response("Forbidden", { status: 403 });
    }
    try {
      const supabase = await createSupabaseServerClient();
      const artifact = await downloadOwnerStatementArtifact(
        supabase,
        membership.organizationId,
        artifactId,
      );
      if (artifact.format !== "xlsx") {
        return new Response("Owner Statement artifact format mismatch.", { status: 409 });
      }
      return attachment(artifact.bytes, artifact.filename, artifact.contentType);
    } catch {
      return new Response("Official Owner Statement artifact is unavailable.", { status: 409 });
    }
  }

  const membership = await getFinanceReportMembershipForUser(user.id);
  if (!membership) {
    return new Response("Forbidden", { status: 403 });
  }

  const searchParams = Object.fromEntries(url.searchParams);
  const viewQuery = parseReportSearchParams(searchParams);
  const excel = await getReportExcel(membership.organizationId, viewQuery);

  if (excel.validation) {
    return textValidation(excel.validation);
  }

  return attachment(
    excel.body,
    excel.filename,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
}

function attachment(bodyBytes: Uint8Array, filename: string, contentType: string) {
  const body = bodyBytes.buffer.slice(
    bodyBytes.byteOffset,
    bodyBytes.byteOffset + bodyBytes.byteLength,
  ) as ArrayBuffer;
  return new Response(body, {
    headers: {
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(bodyBytes.byteLength),
      "Content-Type": contentType,
    },
  });
}

function textValidation(validation: { message: string; status: number }) {
  return new Response(validation.message, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    status: validation.status,
  });
}
