import { getPeopleReportCsv } from "@/features/people/data/people-reports";
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

  const report = new URL(request.url).searchParams.get("report");
  const csv = await getPeopleReportCsv(membership.organizationId, report);

  return new Response(csv.body, {
    headers: {
      "Content-Disposition": `attachment; filename="${csv.filename}"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
