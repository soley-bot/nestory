import { z } from "zod";
import { getCurrentUser, getWorkspaceMembershipForUser } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/db/server";
import { getSavedViewResource, sanitizeViewQuery } from "@/features/saved-views/saved-views";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store, max-age=0", Vary: "Cookie" };
const response = (body: unknown, status = 200) => Response.json(body, { headers, status });
const identity = z.strictObject({ resource: z.string().max(100), name: z.string().trim().min(1).max(60), scope: z.string().max(100) });
const preference = identity.extend({ query: z.string().max(4000) });

async function authorize(resource: string) {
  const config = getSavedViewResource(resource);
  if (!config) return response({ error: "Unsupported saved view." }, 400);
  const user = await getCurrentUser();
  if (!user) return response({ error: "Unauthorized" }, 401);
  const client = await createSupabaseServerClient();
  const membership = await getWorkspaceMembershipForUser(user.id, client);
  if (!membership || (!membership.isSuperAdmin && !membership.permissionKeys.has(config.permission))) return response({ error: "Forbidden" }, 403);
  return { client, userId: user.id, organizationId: membership.organizationId };
}

export async function GET(request: Request) {
  const resource = new URL(request.url).searchParams.get("resource") ?? "";
  const auth = await authorize(resource);
  if (auth instanceof Response) return auth;
  const { data, error } = await auth.client.from("workspace_saved_views").select("name, query")
    .eq("organization_id", auth.organizationId).eq("user_id", auth.userId).eq("resource", resource).order("name").limit(12);
  return error ? response({ error: "Saved views are unavailable. Try again." }, 503) : response({ views: data ?? [], scope: `${auth.organizationId}:${auth.userId}` });
}

async function mutate(request: Request, remove: boolean) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return response({ error: "Forbidden" }, 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return response({ error: "Use a JSON request." }, 400);
  let input: z.infer<typeof identity> & { query?: string };
  try {
    const text = await request.text();
    if (text.length > 6000) return response({ error: "Saved view is too large." }, 413);
    input = (remove ? identity : preference).parse(JSON.parse(text));
    if (input.query !== undefined) input.query = sanitizeViewQuery(input.resource, input.query);
  } catch { return response({ error: "Invalid saved view." }, 400); }
  const auth = await authorize(input.resource);
  if (auth instanceof Response) return auth;
  if (input.scope !== `${auth.organizationId}:${auth.userId}`) return response({ error: "Your workspace changed. Reload before saving views." }, 409);
  const table = auth.client.from("workspace_saved_views");
  const { error } = input.query !== undefined
    ? await table.upsert({ organization_id: auth.organizationId, user_id: auth.userId, resource: input.resource, name: input.name, query: input.query }, { onConflict: "organization_id,user_id,resource,name" })
    : await table.delete().eq("organization_id", auth.organizationId).eq("user_id", auth.userId).eq("resource", input.resource).eq("name", input.name);
  if (error) return response({ error: error.code === "23514" ? "Remove a saved view before adding another (12 maximum)." : "Could not save this change. Try again." }, error.code === "23514" ? 409 : 503);
  return response({ ok: true, scope: `${auth.organizationId}:${auth.userId}` });
}

export async function POST(request: Request) { return mutate(request, false); }
export async function DELETE(request: Request) { return mutate(request, true); }
