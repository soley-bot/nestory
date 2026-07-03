import { getPeopleReportPdf } from "@/features/people/data/people-reports";
import {
  getAdminMembershipForUser,
  getCurrentUser,
} from "@/lib/auth/context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const membership = await getAdminMembershipForUser(user.id);

  if (!membership) {
    return new Response("Forbidden", { status: 403 });
  }

  const report = new URL(request.url).searchParams.get("report");
  const pdf = await getPeopleReportPdf({
    organizationId: membership.organizationId,
    organizationName: membership.organizationName,
    reportParam: report,
  });
  const body = pdf.body.buffer.slice(
    pdf.body.byteOffset,
    pdf.body.byteOffset + pdf.body.byteLength,
  ) as ArrayBuffer;

  return new Response(body, {
    headers: {
      "Content-Disposition": `attachment; filename="${pdf.filename}"`,
      "Content-Length": String(pdf.body.byteLength),
      "Content-Type": "application/pdf",
    },
  });
}
