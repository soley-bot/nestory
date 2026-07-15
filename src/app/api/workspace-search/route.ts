import { searchWorkspace } from "@/features/workspace-search/data/workspace-search";
import {
  getCurrentUser,
  getWorkspaceMembershipForUser,
} from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";

export const dynamic = "force-dynamic";

const PRIVATE_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
};

export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return Response.json(
      { error: "Unauthorized" },
      { headers: PRIVATE_RESPONSE_HEADERS, status: 401 },
    );
  }

  const client = await createSupabaseServerClient();
  const membership = await getWorkspaceMembershipForUser(user.id, client);

  if (!membership) {
    return Response.json(
      { error: "Forbidden" },
      { headers: PRIVATE_RESPONSE_HEADERS, status: 403 },
    );
  }

  const query =
    new URL(request.url).searchParams.get("q")?.trim().replace(/\s+/g, " ") ??
    "";

  try {
    const results = await searchWorkspace({
      client,
      context: {
        branchId: membership.branchId,
        organizationId: membership.organizationId,
        personId: membership.personId,
        role: membership.role,
      },
      query,
    });

    return Response.json(
      { results },
      { headers: PRIVATE_RESPONSE_HEADERS },
    );
  } catch {
    return Response.json(
      { error: "Search unavailable" },
      { headers: PRIVATE_RESPONSE_HEADERS, status: 500 },
    );
  }
}
