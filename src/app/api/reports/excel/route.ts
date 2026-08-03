import { getReportExcel } from "@/features/reports/data/excel";
import {
  getReportScopeValidation,
  parseReportSearchParams,
} from "@/features/reports/reports.filters";
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

  const searchParams = Object.fromEntries(new URL(request.url).searchParams);
  const viewQuery = parseReportSearchParams(searchParams);
  const scopeValidation = getReportScopeValidation(viewQuery);

  if (scopeValidation) {
    return textValidation(scopeValidation);
  }

  const excel = await getReportExcel(membership.organizationId, viewQuery);

  if (excel.validation) {
    return textValidation(excel.validation);
  }

  const body = excel.body.buffer.slice(
    excel.body.byteOffset,
    excel.body.byteOffset + excel.body.byteLength,
  ) as ArrayBuffer;

  return new Response(body, {
    headers: {
      "Content-Disposition": `attachment; filename="${excel.filename}"`,
      "Content-Length": String(excel.body.byteLength),
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  });
}

function textValidation(validation: { message: string; status: number }) {
  return new Response(validation.message, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
    status: validation.status,
  });
}
