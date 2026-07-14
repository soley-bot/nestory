import { getReportCsv } from "@/features/reports/data/csv";
import {
  getReportScopeValidation,
  parseReportSearchParams,
} from "@/features/reports/reports.filters";
import {
  getAdminMembershipForUser,
  getCurrentUser,
} from "@/lib/auth/context";

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
    return new Response(scopeValidation.message, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
      status: scopeValidation.status,
    });
  }
  const csv = await getReportCsv(membership.organizationId, viewQuery);

  return new Response(csv.body, {
    headers: {
      "Content-Disposition": `attachment; filename="${csv.filename}"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
