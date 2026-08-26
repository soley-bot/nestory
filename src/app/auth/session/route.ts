import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createSupabaseAuthRouteClient } from "@/lib/db/auth-route";
import { readBoundedRequestBody } from "@/lib/http/bounded-request-body";

const tokenSchema = z
  .string()
  .min(1)
  .max(16_384)
  .regex(/^[\x21-\x7E]+$/);

const sessionSchema = z
  .object({
    access_token: tokenSchema,
    refresh_token: tokenSchema,
    type: z
      .enum(["email", "email_change", "invite", "magiclink", "signup"])
      .optional(),
  })
  .strict();

const ERROR_MESSAGE = "This email link is invalid or has expired.";
const MAX_SESSION_BODY_BYTES = 40 * 1024;

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return errorResponse(403);
  }

  const requestBody = await readBoundedRequestBody(
    request,
    MAX_SESSION_BODY_BYTES,
  );
  if (!requestBody.ok) return errorResponse(requestBody.status);

  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (contentType !== "application/json") return errorResponse(415);

  let body: unknown;
  try {
    body = JSON.parse(requestBody.text) as unknown;
  } catch {
    return errorResponse(400);
  }

  const parsed = sessionSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400);
  }

  const response = NextResponse.json({ ok: true });
  response.headers.set("cache-control", "no-store");

  const supabase = createSupabaseAuthRouteClient(request, response);
  const { data, error } = await supabase.auth.setSession({
    access_token: parsed.data.access_token,
    refresh_token: parsed.data.refresh_token,
  });

  if (error || !data.user) {
    return errorResponse(401);
  }

  return response;
}

function errorResponse(status: number) {
  return NextResponse.json(
    { error: ERROR_MESSAGE },
    {
      headers: { "cache-control": "no-store" },
      status,
    },
  );
}
